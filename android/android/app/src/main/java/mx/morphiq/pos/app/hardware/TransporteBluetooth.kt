package mx.morphiq.pos.app.hardware

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import mx.morphiq.pos.app.logica.Codigo
import mx.morphiq.pos.app.logica.EnvioPorBloques
import mx.morphiq.pos.app.logica.ErrorDeImpresora
import mx.morphiq.pos.app.logica.EscPos
import mx.morphiq.pos.app.logica.EstadoEscPos
import mx.morphiq.pos.app.logica.OpcionesDeEnvio
import mx.morphiq.pos.app.logica.TraductorDeErrores
import mx.morphiq.pos.app.logica.Transporte
import mx.morphiq.pos.app.logica.VigilanteDeTiempo

/** Bluetooth clásico SPP/RFCOMM con un aparato EMPAREJADO (incluida la «InnerPrinter» de los POS tipo Sunmi). */
class TransporteBluetooth(private val contexto: Context, private val direccion: String) : Transporte {

    override fun enviar(bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (Int) -> Unit) {
        val socket = conectar(opciones.esperaMs)
        val vigilante = VigilanteDeTiempo(opciones.esperaMs) { socket.close() }.iniciar()
        try {
            EnvioPorBloques.escribir(socket.outputStream, bytes, opciones) { enviados ->
                vigilante.latir()
                alProgreso(enviados)
            }
            vigilante.close()
            // Un respiro antes de cerrar: si se cierra de golpe, algunas impresoras pierden el final (el corte).
            Thread.sleep(PAUSA_FINAL_MS)
        } catch (error: IOException) {
            throw if (vigilante.agotado) TraductorDeErrores.tiempo(opciones.esperaMs, error) else TraductorDeErrores.traducir(error, opciones.esperaMs)
        } finally {
            vigilante.close()
            cerrar(socket)
        }
    }

    override fun consultarEstado(esperaMs: Long): EstadoEscPos {
        val socket = conectar(esperaMs)
        try {
            val respuestas = intArrayOf(1, 2, 4).map { n ->
                socket.outputStream.write(EscPos.consultaDeEstado(n))
                socket.outputStream.flush()
                leerConLimite(socket, esperaMs)
            }
            return EscPos.decodificarEstado(respuestas[0], respuestas[1], respuestas[2])
        } catch (error: IOException) {
            throw TraductorDeErrores.traducir(error, esperaMs)
        } finally {
            cerrar(socket)
        }
    }

    private fun adaptador(): BluetoothAdapter {
        val administrador = contexto.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
        val adaptador = administrador?.adapter ?: throw ErrorDeImpresora(Codigo.NO_SOPORTADO, "Este aparato no tiene Bluetooth")
        if (!tienePermiso(contexto)) throw ErrorDeImpresora(Codigo.SIN_PERMISO, "Falta el permiso de Bluetooth")
        if (!adaptador.isEnabled) throw ErrorDeImpresora(Codigo.DESCONECTADA, "El Bluetooth está apagado")
        return adaptador
    }

    private fun dispositivo(adaptador: BluetoothAdapter): BluetoothDevice {
        if (!BluetoothAdapter.checkBluetoothAddress(direccion)) {
            throw ErrorDeImpresora(Codigo.DESCONOCIDO, "La dirección Bluetooth no es válida")
        }
        val aparato = adaptador.getRemoteDevice(direccion)
        if (aparato.bondState != BluetoothDevice.BOND_BONDED) {
            throw ErrorDeImpresora(Codigo.DESCONECTADA, "La impresora no está emparejada con este aparato")
        }
        return aparato
    }

    private fun conectar(esperaMs: Long): BluetoothSocket {
        val adaptador = adaptador()
        val aparato = dispositivo(adaptador)
        adaptador.cancelDiscovery()
        var ultimoFallo: Throwable? = null
        for (seguro in listOf(true, false)) {
            val socket = if (seguro) aparato.createRfcommSocketToServiceRecord(SPP) else aparato.createInsecureRfcommSocketToServiceRecord(SPP)
            try {
                conectarConLimite(socket, esperaMs)
                return socket
            } catch (error: ErrorDeImpresora) {
                cerrar(socket)
                throw error
            } catch (error: IOException) {
                cerrar(socket)
                ultimoFallo = error
            }
        }
        val traducido = TraductorDeErrores.traducir(ultimoFallo ?: IOException("sin conexión"), esperaMs)
        // Un fallo al conectar es «desconectada», no «no se pudo imprimir».
        throw if (traducido.codigo == Codigo.DESCONOCIDO) {
            ErrorDeImpresora(Codigo.DESCONECTADA, "No se pudo conectar con la impresora", traducido)
        } else {
            traducido
        }
    }

    /** `connect()` no tiene tiempo máximo: se corre aparte y, si pasa de [esperaMs], se cierra el socket para abortarlo. */
    private fun conectarConLimite(socket: BluetoothSocket, esperaMs: Long) {
        val fallo = AtomicReference<Throwable?>(null)
        val hilo = Thread({
            try {
                socket.connect()
            } catch (error: Throwable) {
                fallo.set(error)
            }
        }, "bluetooth-conectar")
        hilo.start()
        hilo.join(esperaMs)
        if (hilo.isAlive) {
            cerrar(socket)
            throw TraductorDeErrores.tiempo(esperaMs)
        }
        fallo.get()?.let { throw it }
    }

    private fun leerConLimite(socket: BluetoothSocket, esperaMs: Long): Int? {
        val limite = System.currentTimeMillis() + esperaMs
        while (System.currentTimeMillis() < limite) {
            if (socket.inputStream.available() > 0) return socket.inputStream.read().takeIf { it >= 0 }
            Thread.sleep(SONDEO_MS)
        }
        return null
    }

    private fun cerrar(socket: BluetoothSocket) {
        try {
            socket.close()
        } catch (error: IOException) {
            // Ya estaba cerrado o se cayó: no cambia el resultado del trabajo, que ya se decidió.
            Log.w(ETIQUETA, "No se pudo cerrar el socket Bluetooth: ${error.message}")
        }
    }

    companion object {
        private const val ETIQUETA = "MorphiqBluetooth"
        private const val PAUSA_FINAL_MS = 600L
        private const val SONDEO_MS = 30L
        val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        /** Desde Android 12 hace falta BLUETOOTH_CONNECT en ejecución; antes basta el del manifiesto. */
        private fun pideTiempoDeEjecucion(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

        fun tienePermiso(contexto: Context): Boolean =
            !pideTiempoDeEjecucion() ||
                ContextCompat.checkSelfPermission(contexto, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }
}

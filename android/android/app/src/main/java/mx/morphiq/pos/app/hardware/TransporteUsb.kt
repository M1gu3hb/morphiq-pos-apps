package mx.morphiq.pos.app.hardware

import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import mx.morphiq.pos.app.logica.Codigo
import mx.morphiq.pos.app.logica.ErrorDeImpresora
import mx.morphiq.pos.app.logica.EscPos
import mx.morphiq.pos.app.logica.EstadoEscPos
import mx.morphiq.pos.app.logica.OpcionesDeEnvio
import mx.morphiq.pos.app.logica.PlazoDeEnvio
import mx.morphiq.pos.app.logica.TraductorDeErrores
import mx.morphiq.pos.app.logica.Transporte
import mx.morphiq.pos.app.logica.VigilanteDeTiempo

/** La interfaz del USB por donde se imprime y sus extremos bulk (salida siempre, entrada si existe). */
class SeleccionUsb(val interfaz: UsbInterface, val salida: UsbEndpoint, val entrada: UsbEndpoint?)

/** USB directo: transferencia bulk por bloques a la interfaz de clase impresora (7) o a la primera con un bulk OUT. */
class TransporteUsb(
    private val administrador: UsbManager,
    private val vendorId: Int,
    private val productId: Int,
) : Transporte {

    /**
     * Entrega por bloques con DOS topes: cada `bulkTransfer` espera a lo más [OpcionesDeEnvio.esperaMs]
     * y el conjunto no pasa de [PlazoDeEnvio.totalMs]. Como algunos controladores ignoran el tiempo de
     * un `bulkTransfer`, un vigilante cierra la conexión si el envío se atora o se acaba el plazo total:
     * así un trabajo nunca deja la cola colgada.
     */
    override fun enviar(bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (Int) -> Unit) {
        val dispositivo = encontrar()
        val seleccion = preparar(dispositivo)
        val conexion = abrir(dispositivo, seleccion)
        val plazoMs = PlazoDeEnvio.totalMs(bytes.size, opciones)
        val vigilante = VigilanteDeTiempo(PlazoDeEnvio.inactividadMs(opciones), plazoMs) { conexion.close() }.iniciar()
        try {
            var enviados = 0
            val bloque = opciones.bloqueBytes
            while (enviados < bytes.size) {
                val espera = minOf(opciones.esperaMs, vigilante.restanteMs())
                if (vigilante.agotado || espera <= 0) throw TraductorDeErrores.tiempo(plazoMs)
                val largo = minOf(bloque, bytes.size - enviados)
                val escritos = conexion.bulkTransfer(seleccion.salida, bytes, enviados, largo, espera.toInt())
                if (escritos < 0) throw fallaDeTransferencia(opciones.esperaMs, plazoMs, vigilante)
                enviados += escritos
                vigilante.latir()
                alProgreso(enviados)
                if (opciones.pausaMs > 0 && enviados < bytes.size) {
                    Thread.sleep(opciones.pausaMs)
                    vigilante.latir()
                }
            }
        } finally {
            vigilante.close()
            soltar(conexion, seleccion)
        }
    }

    override fun consultarEstado(esperaMs: Long): EstadoEscPos {
        val dispositivo = encontrar()
        val seleccion = preparar(dispositivo)
        val entrada = seleccion.entrada ?: return EstadoEscPos(null, null, null)
        val conexion = abrir(dispositivo, seleccion)
        try {
            val respuestas = intArrayOf(1, 2, 4).map { n ->
                val consulta = EscPos.consultaDeEstado(n)
                if (conexion.bulkTransfer(seleccion.salida, consulta, consulta.size, esperaMs.toInt()) < 0) return@map null
                val bufer = ByteArray(entrada.maxPacketSize.coerceAtLeast(MINIMO_DE_BUFER))
                val leidos = conexion.bulkTransfer(entrada, bufer, bufer.size, esperaMs.toInt())
                if (leidos > 0) bufer[0].toInt() and 0xFF else null
            }
            return EscPos.decodificarEstado(respuestas[0], respuestas[1], respuestas[2])
        } finally {
            soltar(conexion, seleccion)
        }
    }

    private fun encontrar(): UsbDevice =
        administrador.deviceList.values.firstOrNull { it.vendorId == vendorId && it.productId == productId }
            ?: throw ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora desconectada")

    private fun preparar(dispositivo: UsbDevice): SeleccionUsb {
        if (!administrador.hasPermission(dispositivo)) {
            throw ErrorDeImpresora(Codigo.SIN_PERMISO, "Falta el permiso del USB")
        }
        return seleccionar(dispositivo) ?: throw ErrorDeImpresora(Codigo.NO_SOPORTADO, "Este aparato USB no tiene por dónde imprimir")
    }

    private fun abrir(dispositivo: UsbDevice, seleccion: SeleccionUsb): UsbDeviceConnection {
        val conexion = administrador.openDevice(dispositivo)
            ?: throw ErrorDeImpresora(Codigo.DESCONECTADA, "No se pudo abrir la impresora USB")
        if (!conexion.claimInterface(seleccion.interfaz, true)) {
            conexion.close()
            throw ErrorDeImpresora(Codigo.DESCONECTADA, "La impresora USB está ocupada")
        }
        return conexion
    }

    private fun soltar(conexion: UsbDeviceConnection, seleccion: SeleccionUsb) {
        conexion.releaseInterface(seleccion.interfaz)
        conexion.close()
    }

    /** `bulkTransfer` da -1 igual si hubo tiempo agotado o si se desconectó: se distingue mirando si el aparato sigue. */
    private fun fallaDeTransferencia(esperaMs: Long, plazoMs: Long, vigilante: VigilanteDeTiempo): ErrorDeImpresora {
        val sigue = administrador.deviceList.values.any { it.vendorId == vendorId && it.productId == productId }
        return when {
            !sigue -> ErrorDeImpresora(Codigo.DESCONECTADA, "Impresora desconectada")
            vigilante.agotado || vigilante.restanteMs() <= 0 -> TraductorDeErrores.tiempo(plazoMs)
            else -> TraductorDeErrores.tiempo(esperaMs)
        }
    }

    companion object {
        private const val MINIMO_DE_BUFER = 64

        /** Clase impresora (7) con bulk OUT primero; si no, la primera interfaz con un bulk OUT. */
        fun seleccionar(dispositivo: UsbDevice): SeleccionUsb? {
            val candidatas = (0 until dispositivo.interfaceCount).map { dispositivo.getInterface(it) }
            val ordenadas = candidatas.sortedBy { if (it.interfaceClass == UsbConstants.USB_CLASS_PRINTER) 0 else 1 }
            for (interfaz in ordenadas) {
                val extremos = (0 until interfaz.endpointCount).map { interfaz.getEndpoint(it) }
                val bulk = extremos.filter { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK }
                val salida = bulk.firstOrNull { it.direction == UsbConstants.USB_DIR_OUT } ?: continue
                val entrada = bulk.firstOrNull { it.direction == UsbConstants.USB_DIR_IN }
                return SeleccionUsb(interfaz, salida, entrada)
            }
            return null
        }
    }
}

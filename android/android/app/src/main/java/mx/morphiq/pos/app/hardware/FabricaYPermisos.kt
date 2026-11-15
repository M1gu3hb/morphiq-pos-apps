package mx.morphiq.pos.app.hardware

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean
import mx.morphiq.pos.app.logica.Codigo
import mx.morphiq.pos.app.logica.Conexiones
import mx.morphiq.pos.app.logica.Destino
import mx.morphiq.pos.app.logica.ErrorDeImpresora
import mx.morphiq.pos.app.logica.PUERTO_RED_POR_OMISION
import mx.morphiq.pos.app.logica.Transporte
import mx.morphiq.pos.app.logica.TransporteRed

/** Elige el transporte de un destino. Lo que Android no tiene (spooler, driver, serial) responde `NO_SOPORTADO`. */
class FabricaDeTransportes(private val contexto: Context) {

    fun crear(destino: Destino): Transporte {
        Conexiones.SOLO_WINDOWS[destino.conexion]?.let { throw ErrorDeImpresora(Codigo.NO_SOPORTADO, it) }
        Destino.faltante(destino)?.let { throw ErrorDeImpresora(Codigo.SIN_PERFIL, it) }
        return when (destino.conexion) {
            Conexiones.RED -> TransporteRed(destino.host.orEmpty(), destino.puerto ?: PUERTO_RED_POR_OMISION)
            Conexiones.USB -> {
                val administrador = contexto.getSystemService(Context.USB_SERVICE) as UsbManager?
                    ?: throw ErrorDeImpresora(Codigo.NO_SOPORTADO, "Este aparato no tiene USB")
                TransporteUsb(administrador, destino.vendorId ?: 0, destino.productId ?: 0)
            }
            Conexiones.BLUETOOTH -> TransporteBluetooth(contexto, destino.direccion.orEmpty())
            else -> throw ErrorDeImpresora(Codigo.NO_SOPORTADO, "Esa conexión no existe en Android")
        }
    }
}

/** Pide a Android el permiso de un USB: el diálogo del sistema responde con un broadcast. */
class PermisoUsb(private val contexto: Context) {

    fun pedir(dispositivo: UsbDevice, alTerminar: (Boolean) -> Unit) {
        val administrador = contexto.getSystemService(Context.USB_SERVICE) as UsbManager
        if (administrador.hasPermission(dispositivo)) {
            alTerminar(true)
            return
        }
        val accion = "${contexto.packageName}.PERMISO_USB"
        val respondido = AtomicBoolean(false)
        lateinit var receptor: BroadcastReceiver
        val terminar = { concedido: Boolean ->
            if (respondido.compareAndSet(false, true)) {
                contexto.unregisterReceiver(receptor)
                alTerminar(concedido)
            }
        }
        receptor = object : BroadcastReceiver() {
            override fun onReceive(contextoDelAviso: Context, intento: Intent) {
                terminar(intento.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
            }
        }
        // Receptor NO exportado (obligatorio desde Android 13): sólo recibe lo que se manda a esta app.
        ContextCompat.registerReceiver(contexto, receptor, IntentFilter(accion), ContextCompat.RECEIVER_NOT_EXPORTED)
        // Desde Android 12 el PendingIntent del permiso USB debe ser mutable (el sistema le agrega la respuesta);
        // desde la 14 además debe ser explícito, por eso lleva `setPackage`.
        val banderas = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pendiente = PendingIntent.getBroadcast(contexto, 0, Intent(accion).setPackage(contexto.packageName), banderas)
        administrador.requestPermission(dispositivo, pendiente)
        // Si el aparato se desconecta con el diálogo abierto, Android no contesta: pasado el tiempo se responde que no.
        Handler(Looper.getMainLooper()).postDelayed({ terminar(false) }, ESPERA_DE_RESPUESTA_MS)
    }

    private companion object {
        const val ESPERA_DE_RESPUESTA_MS = 60_000L
    }

    fun encontrar(vendorId: Int, productId: Int): UsbDevice? {
        val administrador = contexto.getSystemService(Context.USB_SERVICE) as UsbManager? ?: return null
        return administrador.deviceList.values.firstOrNull { it.vendorId == vendorId && it.productId == productId }
    }
}

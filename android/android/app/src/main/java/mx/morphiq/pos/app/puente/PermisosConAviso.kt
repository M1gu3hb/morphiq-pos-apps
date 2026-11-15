package mx.morphiq.pos.app.puente

import android.Manifest
import android.hardware.usb.UsbDevice
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import mx.morphiq.pos.app.R
import mx.morphiq.pos.app.hardware.PermisoUsb
import mx.morphiq.pos.app.hardware.TransporteBluetooth

/** Diálogos nativos de la app. Todo corre en el hilo principal. */
object Avisos {

    /** Explica algo y deja elegir; [alRechazar] también corre si cierran el diálogo sin elegir. */
    fun explicar(
        actividad: ComponentActivity,
        titulo: String,
        texto: String,
        botonSi: String,
        botonNo: String,
        alRechazar: () -> Unit,
        alAceptar: () -> Unit,
    ) {
        if (actividad.isFinishing || actividad.isDestroyed) {
            alRechazar()
            return
        }
        AlertDialog.Builder(actividad)
            .setTitle(titulo)
            .setMessage(texto)
            .setPositiveButton(botonSi) { _, _ -> alAceptar() }
            .setNegativeButton(botonNo) { _, _ -> alRechazar() }
            .setOnCancelListener { alRechazar() }
            .show()
    }
}

/**
 * Permisos de ejecución CON explicación en pantalla antes de pedirlos: primero un diálogo que dice
 * para qué, y sólo si la persona acepta sale la pregunta de Android.
 */
class PermisosConAviso(private val actividad: ComponentActivity, private val usb: PermisoUsb) {
    private var respuestaDeBluetooth: ((Boolean) -> Unit)? = null

    private val solicitudDeBluetooth = actividad.registerForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
        val respuesta = respuestaDeBluetooth
        respuestaDeBluetooth = null
        respuesta?.invoke(concedido)
    }

    fun pedirBluetooth(alTerminar: (Boolean) -> Unit) {
        actividad.runOnUiThread {
            if (TransporteBluetooth.tienePermiso(actividad)) {
                alTerminar(true)
            } else {
                Avisos.explicar(
                    actividad,
                    actividad.getString(R.string.aviso_bluetooth_titulo),
                    actividad.getString(R.string.aviso_bluetooth_texto),
                    actividad.getString(R.string.boton_entendido),
                    actividad.getString(R.string.boton_ahora_no),
                    alRechazar = { alTerminar(false) },
                ) {
                    respuestaDeBluetooth = alTerminar
                    solicitudDeBluetooth.launch(Manifest.permission.BLUETOOTH_CONNECT)
                }
            }
        }
    }

    fun pedirUsb(dispositivo: UsbDevice, alTerminar: (Boolean) -> Unit) {
        actividad.runOnUiThread {
            Avisos.explicar(
                actividad,
                actividad.getString(R.string.aviso_usb_titulo),
                actividad.getString(R.string.aviso_usb_texto),
                actividad.getString(R.string.boton_entendido),
                actividad.getString(R.string.boton_ahora_no),
                alRechazar = { alTerminar(false) },
            ) {
                usb.pedir(dispositivo, alTerminar)
            }
        }
    }
}

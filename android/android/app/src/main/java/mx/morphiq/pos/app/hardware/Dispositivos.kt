package mx.morphiq.pos.app.hardware

import android.annotation.SuppressLint
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import mx.morphiq.pos.app.logica.InnerPrinter

class UsbVisto(
    val nombre: String,
    val vendorId: Int,
    val productId: Int,
    val clase: Int,
    /** Se anuncia como impresora (clase 7). */
    val esImpresora: Boolean,
    /** Tiene por dónde imprimir (clase 7, o un bulk OUT en una clase propia del fabricante). */
    val puedeImprimir: Boolean,
    val conPermiso: Boolean,
)

class BluetoothVisto(
    val nombre: String,
    val direccion: String,
    val esInnerPrinter: Boolean,
    /** Parece impresora: clase «imagen», la InnerPrinter, o un aparato sin clasificar. */
    val pareceImpresora: Boolean,
)

/** Lo que el aparato tiene conectado y emparejado. Lo que no se puede leer se dice, no se inventa. */
class Dispositivos(private val contexto: Context) {

    private val paquetesDeMarca = mapOf(
        "sunmi" to "woyou.aidlservice.jiuiv5",
        "imin" to "com.imin.printerservice",
    )

    fun tieneUsbHost(): Boolean = contexto.packageManager.hasSystemFeature(PackageManager.FEATURE_USB_HOST)

    fun tieneBluetooth(): Boolean = contexto.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH)

    fun usb(): List<UsbVisto> {
        val administrador = contexto.getSystemService(Context.USB_SERVICE) as UsbManager? ?: return emptyList()
        return administrador.deviceList.values.map { visto(administrador, it) }.sortedBy { it.nombre }
    }

    private fun visto(administrador: UsbManager, aparato: UsbDevice): UsbVisto {
        val clases = (0 until aparato.interfaceCount).map { aparato.getInterface(it).interfaceClass }
        val clase = if (aparato.deviceClass != 0) aparato.deviceClass else clases.firstOrNull() ?: 0
        val esImpresora = aparato.deviceClass == UsbConstants.USB_CLASS_PRINTER || clases.contains(UsbConstants.USB_CLASS_PRINTER)
        val propia = clases.contains(UsbConstants.USB_CLASS_VENDOR_SPEC) && TransporteUsb.seleccionar(aparato) != null
        return UsbVisto(
            nombre = nombreDe(aparato),
            vendorId = aparato.vendorId,
            productId = aparato.productId,
            clase = clase,
            esImpresora = esImpresora,
            puedeImprimir = esImpresora || propia,
            conPermiso = administrador.hasPermission(aparato),
        )
    }

    /** Desde Android 10 el nombre del producto puede exigir permiso: si no se deja leer, queda el identificador. */
    private fun nombreDe(aparato: UsbDevice): String {
        val producto = try {
            aparato.productName
        } catch (error: SecurityException) {
            null
        }
        return producto?.takeIf { it.isNotBlank() } ?: "USB %04x:%04x".format(aparato.vendorId, aparato.productId)
    }

    fun tienePermisoDeBluetooth(): Boolean = TransporteBluetooth.tienePermiso(contexto)

    /** Los emparejados, o `null` (y un aviso) si no se pueden leer. */
    @SuppressLint("MissingPermission")
    fun bluetoothEmparejados(avisos: MutableList<String>): List<BluetoothVisto>? {
        if (!tieneBluetooth()) {
            avisos.add("Bluetooth: este aparato no tiene Bluetooth.")
            return null
        }
        if (!tienePermisoDeBluetooth()) {
            avisos.add("Bluetooth: falta el permiso para ver los aparatos emparejados.")
            return null
        }
        val adaptador = (contexto.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
        if (adaptador == null) {
            avisos.add("Bluetooth: el aparato no entregó un adaptador.")
            return null
        }
        return try {
            adaptador.bondedDevices.map {
                val nombre = it.name ?: it.address
                val clase = it.bluetoothClass?.majorDeviceClass
                val inner = InnerPrinter.esPorNombre(it.name)
                BluetoothVisto(
                    nombre = nombre,
                    direccion = it.address,
                    esInnerPrinter = inner,
                    pareceImpresora = inner || clase == BluetoothClass.Device.Major.IMAGING || clase == BluetoothClass.Device.Major.UNCATEGORIZED,
                )
            }.sortedBy { it.nombre }
        } catch (error: SecurityException) {
            avisos.add("Bluetooth: Android no dejó leer los emparejados (${error.message}).")
            null
        }
    }

    /** Los servicios de impresión de la marca (Sunmi, iMin) instalados. Sólo se detectan, no se usan. */
    fun serviciosDeMarca(): List<String> = paquetesDeMarca.filterValues { instalado(it) }.keys.toList()

    private fun instalado(paquete: String): Boolean = try {
        contexto.packageManager.getPackageInfo(paquete, 0)
        true
    } catch (error: PackageManager.NameNotFoundException) {
        false
    }
}

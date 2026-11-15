package mx.morphiq.pos.app.puente

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import androidx.webkit.WebViewCompat
import mx.morphiq.pos.app.BuildConfig
import mx.morphiq.pos.app.hardware.Dispositivos
import mx.morphiq.pos.app.logica.AjustesMezcla
import mx.morphiq.pos.app.logica.DecisionDeModoLigero
import mx.morphiq.pos.app.logica.ModoLigero
import org.json.JSONArray
import org.json.JSONObject

private const val BYTES_POR_MB = 1024L * 1024L

/** Lo que se sabe del aparato (RAM, núcleos, pantalla, WebView…). Nada se inventa: lo que no se lee va a `avisos`. */
class InfoDelAparato(private val contexto: Context, private val dispositivos: Dispositivos) {

    private fun memoria(): ActivityManager.MemoryInfo {
        val administrador = contexto.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return ActivityManager.MemoryInfo().also { administrador.getMemoryInfo(it) }
    }

    private fun ramBaja(): Boolean = (contexto.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isLowRamDevice

    fun modoLigero(ajustes: JSONObject): DecisionDeModoLigero = ModoLigero.decidir(
        manual = AjustesMezcla.modoLigeroManual(ajustes),
        ramTotalMb = memoria().totalMem / BYTES_POR_MB,
        nucleos = Runtime.getRuntime().availableProcessors(),
        aparatoDeRamBaja = ramBaja(),
    )

    fun modoLigeroJson(ajustes: JSONObject): JSONObject = modoLigeroAJson(modoLigero(ajustes))

    fun modoLigeroAJson(decision: DecisionDeModoLigero): JSONObject = JSONObject().apply {
        put("activo", decision.activo)
        put("origen", decision.origen)
        put("motivo", decision.motivo)
    }

    private fun procesador(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val fabricante = Build.SOC_MANUFACTURER
            val modelo = Build.SOC_MODEL
            if (modelo.isNotBlank() && modelo != Build.UNKNOWN) {
                return if (fabricante.isNotBlank() && fabricante != Build.UNKNOWN) "$fabricante $modelo" else modelo
            }
        }
        return Build.HARDWARE
    }

    private fun navegador(avisos: MutableList<String>): JSONObject {
        val paquete = WebViewCompat.getCurrentWebViewPackage(contexto)
        if (paquete == null) {
            avisos.add("WebView: Android no dijo cuál WebView usa.")
            return JSONObject().put("nombre", "WebView del sistema").put("version", "desconocida")
        }
        val etiqueta = paquete.applicationInfo?.loadLabel(contexto.packageManager)?.toString() ?: paquete.packageName
        return JSONObject().put("nombre", etiqueta).put("version", paquete.versionName ?: "desconocida")
    }

    /** El `Diagnostico` del contrato. */
    fun diagnostico(ajustes: JSONObject, impresoras: JSONArray, avisos: MutableList<String>): JSONObject {
        val memoria = memoria()
        val pantalla = contexto.resources.displayMetrics
        val es64 = Process.is64Bit()
        val sistema = JSONObject().apply {
            put("nombre", "Android ${Build.VERSION.RELEASE}")
            put("version", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            put("bits", if (es64) 64 else 32)
            put("marca", Build.MANUFACTURER)
            put("modelo", "${Build.MODEL} (${Build.DEVICE})")
        }
        val usb = dispositivos.usb()
        val bluetooth = dispositivos.bluetoothEmparejados(avisos)
        val resultado = JSONObject().apply {
            put("app", JSONObject().put("nombre", BuildConfig.CLIENTE_NOMBRE).put("version", BuildConfig.VERSION_NAME).put("cliente", BuildConfig.CLIENTE_ID))
            put("plataforma", "android")
            put("sistema", sistema)
            put("memoria", JSONObject().put("totalMb", memoria.totalMem / BYTES_POR_MB).put("libreMb", memoria.availMem / BYTES_POR_MB))
            put(
                "procesador",
                JSONObject().put("nombre", procesador()).put("nucleos", Runtime.getRuntime().availableProcessors())
                    .put("arquitectura", Build.SUPPORTED_ABIS.joinToString(", ")),
            )
            put(
                "pantalla",
                JSONObject().put("anchoPx", pantalla.widthPixels).put("altoPx", pantalla.heightPixels).put("escala", pantalla.density.toDouble())
                    .put("tactil", contexto.packageManager.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)),
            )
            put("navegador", navegador(avisos))
            put("impresoras", impresoras)
            if (bluetooth != null) {
                put("bluetooth", JSONArray(bluetooth.map { JSONObject().put("nombre", it.nombre).put("direccion", it.direccion).put("esInnerPrinter", it.esInnerPrinter) }))
            }
            put(
                "usb",
                JSONArray(
                    usb.map {
                        JSONObject().put("nombre", it.nombre).put("vendorId", it.vendorId).put("productId", it.productId)
                            .put("clase", it.clase).put("esImpresora", it.esImpresora)
                    },
                ),
            )
            put("serviciosDeMarca", JSONArray(dispositivos.serviciosDeMarca()))
            put("modoLigero", modoLigeroJson(ajustes))
            put("avisos", JSONArray(avisos))
        }
        return resultado
    }
}

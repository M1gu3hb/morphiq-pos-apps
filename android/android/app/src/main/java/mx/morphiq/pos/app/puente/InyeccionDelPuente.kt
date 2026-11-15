package mx.morphiq.pos.app.puente

import android.app.Activity
import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient
import com.getcapacitor.JSExport
import mx.morphiq.pos.app.logica.OrigenPermitido

/**
 * Pone `window.MorphiqApp` en la página ANTES de que corra cualquier guion suyo, y sólo en los
 * orígenes permitidos: `https://<dominio>` (el POS) y `https://localhost` (las pantallas internas).
 *
 * Capacitor ya inyecta su puente nativo en el origen local. Al origen del POS hay que darle ese
 * mismo puente (con el plugin `MorphiqApp` y nada más) más el guion de `MorphiqApp`.
 */
class InyeccionDelPuente(private val actividad: Activity, private val bridge: Bridge, private val dominio: String) {

    private val guionDelPuente: String by lazy {
        actividad.assets.open(ARCHIVO_DEL_PUENTE).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /** `true` si se inyectó al inicio del documento; `false` si el WebView no lo permite y hay que usar el plan B. */
    fun instalar(): Boolean {
        val web = bridge.webView
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Log.w(ETIQUETA, "El WebView no soporta guiones al inicio del documento: se inyecta al empezar y al terminar la página.")
            return false
        }
        return try {
            WebViewCompat.addDocumentStartJavaScript(web, guionParaElPos(), setOf("https://${dominio.lowercase()}"))
            WebViewCompat.addDocumentStartJavaScript(web, guionDelPuente, setOf(bridge.localUrl))
            true
        } catch (error: IllegalArgumentException) {
            Log.e(ETIQUETA, "No se pudo registrar el guion al inicio del documento: ${error.message}")
            false
        }
    }

    /** El puente nativo de Capacitor (sólo con el plugin MorphiqApp) y el guion de `MorphiqApp`, para el origen del POS. */
    private fun guionParaElPos(): String {
        val plugin = bridge.getPlugin(NOMBRE_DEL_PLUGIN) ?: error("El plugin $NOMBRE_DEL_PLUGIN no está registrado")
        return listOf(
            JSExport.getGlobalJS(actividad, false, false),
            "window.WEBVIEW_SERVER_URL = '${bridge.localUrl}';",
            JSExport.getBridgeJS(actividad),
            JSExport.getPluginJS(listOf(plugin)),
            guionDelPuente,
        ).joinToString("\n\n")
    }

    /** Plan B: inyecta con `evaluateJavascript`, y sólo si la URL de la página es de un origen permitido. */
    fun inyectarSiEsPermitido(web: WebView, url: String?) {
        if (OrigenPermitido.esPermitido(url, dominio)) web.evaluateJavascript(guionDelPuente, null)
    }

    companion object {
        const val NOMBRE_DEL_PLUGIN = "MorphiqApp"
        private const val ARCHIVO_DEL_PUENTE = "morphiq-app-puente.js"
        private const val ETIQUETA = "MorphiqPuente"
    }
}

/**
 * El cliente del WebView de Capacitor con dos cambios: sólo se abren fuera de la app direcciones
 * http/https (nada de `intent:` ni `market:`), y, si el WebView no soporta guiones al inicio, se
 * inyecta el puente al empezar y al terminar cada página permitida.
 */
class ClienteWebMorphiq(bridge: Bridge, private val inyeccion: InyeccionDelPuente, private val usarPlanB: Boolean) : BridgeWebViewClient(bridge) {

    private fun esWeb(esquema: String?): Boolean = esquema == "https" || esquema == "http"

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        if (!esWeb(request.url.scheme)) true else super.shouldOverrideUrlLoading(view, request)

    @Deprecated("Para WebViews viejos")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
        if (!esWeb(Uri.parse(url).scheme)) true else super.shouldOverrideUrlLoading(view, url)

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        if (usarPlanB) inyeccion.inyectarSiEsPermitido(view, url)
    }

    override fun onPageFinished(view: WebView, url: String?) {
        super.onPageFinished(view, url)
        if (usarPlanB) inyeccion.inyectarSiEsPermitido(view, url)
    }
}

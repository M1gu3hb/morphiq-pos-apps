package mx.morphiq.pos.app.logica

import java.net.URI
import java.net.URISyntaxException

/**
 * Quién puede hablarle al plugin: la página de producción del cliente (https y host EXACTAMENTE
 * igual al dominio) y las pantallas internas de la app (`https://localhost`, el origen local de
 * Capacitor). Se compara el host ya separado de la URL, nunca con `contains`/`startsWith` sobre el
 * texto: así `https://pos.vercel.app.evil.com` o `https://evil.com/?u=pos.vercel.app` no pasan.
 */
object OrigenPermitido {
    const val HOST_LOCAL = "localhost"
    private const val PUERTO_HTTPS = 443
    private const val SIN_PUERTO = -1

    fun esPermitido(url: String?, dominio: String): Boolean {
        if (url.isNullOrBlank() || dominio.isBlank()) return false
        val uri = try {
            URI(url.trim())
        } catch (error: URISyntaxException) {
            return false
        }
        if (!"https".equals(uri.scheme, ignoreCase = true)) return false
        val host = uri.host?.lowercase() ?: return false
        // Un puerto distinto del 443 es otro origen aunque el host coincida.
        if (uri.port != SIN_PUERTO && uri.port != PUERTO_HTTPS) return false
        return host == dominio.lowercase() || host == HOST_LOCAL
    }

    /** `https://<dominio>` y `https://localhost`: los orígenes donde se inyecta el puente. */
    fun origenes(dominio: String): Set<String> = linkedSetOf("https://${dominio.lowercase()}", "https://$HOST_LOCAL")
}

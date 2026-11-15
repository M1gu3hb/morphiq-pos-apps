package mx.morphiq.pos.app.logica

import org.json.JSONObject

/**
 * Cómo quedó armado el puente en ESTE WebView. Depende de dos funciones del WebView (androidx.webkit):
 *  - `DOCUMENT_START_SCRIPT`: deja correr el guion del puente antes que cualquier guion de la página.
 *    Sin ella se usa el plan B: inyectar con `evaluateJavascript` al empezar y al terminar la página.
 *  - `WEB_MESSAGE_LISTENER`: Capacitor recibe las llamadas del puente con la bandera «marco principal»
 *    y descarta las de iframes. Sin ella usa `addJavascriptInterface`, que se ve en TODOS los marcos y
 *    no dice de cuál viene la llamada: sólo queda la revisión de la URL de la página principal.
 * Nunca se bloquea el POS por falta de alguna: sólo se avisa.
 */
data class ModoDelPuente(
    val inicioDelDocumento: Boolean,
    val marcoPrincipalVerificado: Boolean,
    val falloAlInstalar: String? = null,
) {
    val planB: Boolean get() = !inicioDelDocumento

    /** Si hay algo que explicarle a quien atiende el aparato. */
    val requiereAviso: Boolean get() = planB || !marcoPrincipalVerificado

    fun avisos(): List<String> = buildList {
        if (planB) {
            add("El WebView de este aparato es viejo y no deja preparar el puente antes de abrir la página: se usa el modo compatible. El POS sigue funcionando.")
        }
        if (!marcoPrincipalVerificado) {
            add("El WebView de este aparato no distingue de qué parte de la página viene cada llamada a la impresora: sólo se acepta la página principal del POS.")
        }
        falloAlInstalar?.let { add("No se pudo preparar el puente al inicio ($it); se usa el modo compatible.") }
    }

    fun aJson(): JSONObject = JSONObject().apply {
        put("inyeccion", if (inicioDelDocumento) "inicio-del-documento" else "plan-b")
        put("canal", if (marcoPrincipalVerificado) "web-message-listener" else "javascript-interface")
        put("marcoPrincipalVerificado", marcoPrincipalVerificado)
    }

    /** El texto corto del aviso único que ve la persona (sin tecnicismos). */
    fun avisoUnico(): String = "Este aparato usa un motor de pantalla antiguo: la app trabaja en modo compatible."

    companion object {
        /** El modo cuando todo es moderno: nada que avisar. */
        val COMPLETO = ModoDelPuente(inicioDelDocumento = true, marcoPrincipalVerificado = true)
    }
}

package mx.morphiq.pos.app.puente

import android.util.Log
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import mx.morphiq.pos.app.BuildConfig
import mx.morphiq.pos.app.logica.AjustesMezcla
import mx.morphiq.pos.app.logica.Codigo
import mx.morphiq.pos.app.logica.Destino
import mx.morphiq.pos.app.logica.EscPos
import mx.morphiq.pos.app.logica.OpcionesDeEnvio
import mx.morphiq.pos.app.logica.Topes
import mx.morphiq.pos.app.logica.TrabajoDeImpresion
import mx.morphiq.pos.app.logica.opcionesSeguras
import org.json.JSONObject

/**
 * `imprimir`, `abrirCajon`, `paginaDePrueba` y `reimprimirUltimo`. Cada operación entrega su
 * respuesta con [responder] o, si el MAL USO es de quien llama (argumentos inválidos), con
 * [rechazar]. Un fallo de la impresora NO es un rechazo: va dentro del resultado.
 */
class OperacionesDeImpresion(private val servicios: ServiciosDeLaApp) {

    fun imprimir(datos: JSONObject, responder: (JSONObject) -> Unit, rechazar: (String) -> Unit) {
        val id = datos.optString("id", "").trim()
        if (id.isEmpty()) return rechazar("Falta el id del trabajo")
        val documento = datos.optJSONObject("documento") ?: return rechazar("Falta el documento del trabajo")
        when (documento.optString("tipo", "")) {
            "crudo" -> Unit
            "html" -> return responder(Respuestas.fallo(id, Codigo.NO_SOPORTADO, "Los documentos HTML sólo se imprimen en Windows"))
            else -> return rechazar("El tipo de documento debe ser «crudo»")
        }
        val bytes = leerBytes(documento.optString("base64", ""), Topes.MAX_BYTES_DOCUMENTO, "documento", rechazar) ?: return
        val opciones = opcionesSeguras(Respuestas.entero(documento, "bloqueBytes"), Respuestas.largo(documento, "pausaMs"), Respuestas.largo(datos, "esperaMs"))
        datos.optJSONObject("recordar")?.let { recordar(it) }

        val destino = destinoDe(datos.optJSONObject("destino"))
            ?: return responder(Respuestas.fallo(id, Codigo.SIN_PERFIL, "Falta elegir la impresora de este POS"))
        val copias = (Respuestas.entero(datos, "copias") ?: 1).coerceIn(1, MAX_COPIAS)
        entregar(TrabajoDeImpresion(id, destino, bytes, copias, opciones), responder)
    }

    fun abrirCajon(opciones: JSONObject, responder: (JSONObject) -> Unit, rechazar: (String) -> Unit) {
        val id = idNuevo("cajon")
        val pulso = if (opciones.has("base64")) {
            leerBytes(opciones.optString("base64", ""), Topes.MAX_BYTES_PULSO, "pulso", rechazar) ?: return
        } else {
            pulsoDelPerfil() ?: EscPos.PULSO_CAJON
        }
        val destino = destinoDe(opciones.optJSONObject("destino"))
            ?: return responder(Respuestas.fallo(id, Codigo.SIN_PERFIL, "Falta elegir la impresora de este POS"))
        entregar(TrabajoDeImpresion(id, destino, pulso), responder)
    }

    fun paginaDePrueba(opciones: JSONObject, responder: (JSONObject) -> Unit) {
        val id = idNuevo("prueba")
        val destino = destinoDe(opciones.optJSONObject("destino"))
            ?: return responder(Respuestas.fallo(id, Codigo.SIN_PERFIL, "Falta elegir la impresora de este POS"))
        val pagina = EscPos.paginaDePrueba(BuildConfig.CLIENTE_NOMBRE, fechaHora(), destino.etiqueta())
        entregar(TrabajoDeImpresion(id, destino, pagina), responder)
    }

    fun reimprimirUltimo(responder: (JSONObject) -> Unit) {
        val id = idNuevo("reimpresion")
        val guardado = servicios.ultimoTicket.leer()
            ?: return responder(Respuestas.fallo(id, Codigo.SIN_PERFIL, "Todavía no hay un ticket para reimprimir"))
        val destino = destinoDe(null)
            ?: return responder(Respuestas.fallo(id, Codigo.SIN_PERFIL, "Falta elegir la impresora de este POS"))
        val opciones = opcionesSeguras(guardado.bloqueBytes, guardado.pausaMs, null)
        entregar(TrabajoDeImpresion(id, destino, EscPos.reimpresion(fechaHora(), guardado.bytes), 1, opciones), responder)
    }

    fun ultimoTicket(): JSONObject? = servicios.ultimoTicket.leer()?.let {
        JSONObject().put("titulo", it.titulo).put("guardadoEn", it.guardadoEn)
    }

    /** El destino dado o, si falta, el del perfil guardado en el aparato. */
    fun destinoDe(dado: JSONObject?): Destino? =
        Destino.desdeJson(dado) ?: Destino.desdeJson(AjustesMezcla.perfilDestino(servicios.ajustes.leer()))

    private fun entregar(trabajo: TrabajoDeImpresion, responder: (JSONObject) -> Unit) {
        servicios.impresion.imprimir(
            trabajo,
            alProgreso = { id, enviados, total ->
                servicios.emitir("progreso", JSONObject().put("id", id).put("enviados", enviados).put("total", total))
            },
            alTerminar = { terminado -> responder(Respuestas.resultado(terminado)) },
        )
    }

    /** El pulso del perfil guardado; si es ilegible o se pasa del tope se ignora (se usa el pulso estándar) y queda en el registro. */
    private fun pulsoDelPerfil(): ByteArray? {
        val base64 = AjustesMezcla.perfilCajonBase64(servicios.ajustes.leer()) ?: return null
        if (!Topes.base64Cabe(base64.length, Topes.MAX_BYTES_PULSO)) {
            Log.w(ETIQUETA, "El pulso del cajón guardado pesa más de ${Topes.legible(Topes.MAX_BYTES_PULSO)}: se usa el estándar")
            return null
        }
        return Respuestas.bytesDeBase64(base64)
    }

    /**
     * Decodifica [base64] sólo si cabe en [maxBytes] (se mide ANTES de decodificar para no gastar
     * memoria en algo que se va a rechazar). Si no, rechaza con ARGUMENTOS y devuelve `null`.
     */
    private fun leerBytes(base64: String, maxBytes: Int, que: String, rechazar: (String) -> Unit): ByteArray? {
        if (!Topes.base64Cabe(base64.length, maxBytes)) {
            rechazar("El $que pesa más de ${Topes.legible(maxBytes)} y no se acepta")
            return null
        }
        val bytes = Respuestas.bytesDeBase64(base64)
        if (bytes == null) {
            rechazar("El base64 del $que no es válido")
            return null
        }
        if (bytes.size > maxBytes) {
            rechazar("El $que pesa más de ${Topes.legible(maxBytes)} y no se acepta")
            return null
        }
        return bytes
    }

    /** Guarda el «último ticket». Si no se puede guardar el trabajo se imprime igual, pero queda en el registro. */
    private fun recordar(recordar: JSONObject) {
        val documento = recordar.optJSONObject("documento")
        val base64 = documento?.optString("base64", "").orEmpty()
        if (!Topes.base64Cabe(base64.length, Topes.MAX_BYTES_DOCUMENTO)) {
            Log.w(ETIQUETA, "«recordar» pesa más de ${Topes.legible(Topes.MAX_BYTES_DOCUMENTO)}: no se guarda el último ticket")
            return
        }
        val bytes = Respuestas.bytesDeBase64(base64)
        if (documento == null || bytes == null) {
            Log.w(ETIQUETA, "«recordar» no trae un documento crudo válido: no se guarda el último ticket")
            return
        }
        try {
            servicios.ultimoTicket.guardar(
                titulo = recordar.optString("titulo", "Último ticket"),
                bytes = bytes,
                bloqueBytes = Respuestas.entero(documento, "bloqueBytes"),
                pausaMs = Respuestas.largo(documento, "pausaMs"),
                guardadoEn = fechaIso(),
            )
        } catch (error: IOException) {
            Log.e(ETIQUETA, "No se pudo guardar el último ticket: ${error.message}")
        }
    }

    private fun fechaHora(): String = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ROOT).format(Date())

    private fun fechaIso(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.ROOT).format(Date())

    /** Cada prueba, cajón o reimpresión es un trabajo NUEVO: su id nunca se repite (no caería en «duplicado»). */
    private fun idNuevo(tipo: String): String = "app-$tipo-${UUID.randomUUID()}"

    private companion object {
        const val ETIQUETA = "MorphiqImpresion"
        const val MAX_COPIAS = 20
    }
}

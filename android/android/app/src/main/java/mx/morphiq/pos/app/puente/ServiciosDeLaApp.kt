package mx.morphiq.pos.app.puente

import android.content.Context
import java.io.File
import mx.morphiq.pos.app.BuildConfig
import mx.morphiq.pos.app.actualizacion.ActualizadorAndroid
import mx.morphiq.pos.app.hardware.Dispositivos
import mx.morphiq.pos.app.hardware.FabricaDeTransportes
import mx.morphiq.pos.app.hardware.PermisoUsb
import mx.morphiq.pos.app.logica.ColaDeImpresion
import mx.morphiq.pos.app.logica.ServicioDeImpresion
import org.json.JSONObject

/** Todo lo que vive mientras vive la app: ajustes, cola, hardware y actualizador. Lo crea MainActivity una sola vez. */
class ServiciosDeLaApp(contexto: Context) {
    val ajustes = AlmacenDeAjustes(contexto)
    val ultimoTicket = UltimoTicket(File(contexto.filesDir, "ultimo-ticket.json"))
    val dispositivos = Dispositivos(contexto)
    val info = InfoDelAparato(contexto, dispositivos)
    val fabrica = FabricaDeTransportes(contexto)
    val permisoUsb = PermisoUsb(contexto)
    val cola = ColaDeImpresion(RegistroDeEntregadosEnPreferencias(contexto))
    val impresion = ServicioDeImpresion(cola, fabrica::crear)
    val actualizador = ActualizadorAndroid(contexto, BuildConfig.URL_ACTUALIZACION, BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME)

    /** Quién manda los eventos (`progreso`, `modo-ligero`…) a la página: lo pone el plugin al cargarse. */
    @Volatile var emitir: (evento: String, datos: JSONObject) -> Unit = { _, _ -> }
}

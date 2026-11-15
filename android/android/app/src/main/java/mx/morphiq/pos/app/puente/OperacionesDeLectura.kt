package mx.morphiq.pos.app.puente

import mx.morphiq.pos.app.logica.Conexiones
import mx.morphiq.pos.app.logica.Destino
import mx.morphiq.pos.app.logica.ErrorDeImpresora
import mx.morphiq.pos.app.logica.TraductorDeErrores
import org.json.JSONArray
import org.json.JSONObject

/** Lo que sólo LEE el aparato: impresoras, conexiones, estado, diagnóstico y modo ligero. */
class OperacionesDeLectura(private val servicios: ServiciosDeLaApp, private val impresion: OperacionesDeImpresion) {

    /** Las impresoras que se pueden usar: USB que pueden imprimir y Bluetooth emparejados que parecen impresora. */
    fun impresoras(avisos: MutableList<String>): JSONArray {
        val lista = JSONArray()
        val dispositivos = servicios.dispositivos
        dispositivos.usb().filter { it.puedeImprimir }.forEach {
            lista.put(
                JSONObject()
                    .put("id", "usb:${it.vendorId}:${it.productId}")
                    .put("nombre", it.nombre)
                    .put("destino", JSONObject().put("conexion", Conexiones.USB).put("vendorId", it.vendorId).put("productId", it.productId))
                    .put("detalle", "USB · vendor ${it.vendorId} · product ${it.productId}")
                    .put("esImpresora", it.esImpresora)
                    .put("conPermiso", it.conPermiso),
            )
        }
        dispositivos.bluetoothEmparejados(avisos)?.filter { it.pareceImpresora }?.forEach {
            lista.put(
                JSONObject()
                    .put("id", "bluetooth:${it.direccion}")
                    .put("nombre", it.nombre)
                    .put("destino", JSONObject().put("conexion", Conexiones.BLUETOOTH).put("direccion", it.direccion))
                    .put("detalle", if (it.esInnerPrinter) "InnerPrinter · impresora integrada" else "Bluetooth")
                    .put("conPermiso", true),
            )
        }
        return lista
    }

    /** Qué conexiones puede usar Android y, de las que no, por qué. */
    fun conexiones(): JSONArray {
        val d = servicios.dispositivos
        val lista = JSONArray()
        lista.put(capacidad(Conexiones.RED, true, null))
        lista.put(capacidad(Conexiones.USB, d.tieneUsbHost(), "Este aparato no puede conectar accesorios por USB"))
        lista.put(capacidad(Conexiones.BLUETOOTH, d.tieneBluetooth(), "Este aparato no tiene Bluetooth"))
        Conexiones.SOLO_WINDOWS.forEach { (conexion, motivo) -> lista.put(capacidad(conexion, false, motivo)) }
        return lista
    }

    private fun capacidad(conexion: String, disponible: Boolean, motivo: String?): JSONObject {
        val objeto = JSONObject().put("conexion", conexion).put("disponible", disponible)
        if (!disponible && motivo != null) objeto.put("motivo", motivo)
        return objeto
    }

    fun diagnostico(): JSONObject {
        val avisos = mutableListOf<String>()
        val lista = impresoras(avisos)
        return servicios.info.diagnostico(servicios.ajustes.leer(), lista, avisos)
    }

    /** `DLE EOT` por la conexión que lo permita; se serializa con la cola para no atravesarse con una impresión. */
    fun estado(opciones: JSONObject, responder: (JSONObject) -> Unit) {
        val destino = impresion.destinoDe(opciones.optJSONObject("destino"))
        if (destino == null) {
            responder(JSONObject().put("soportado", false).put("mensaje", "Falta elegir la impresora de este POS"))
            return
        }
        servicios.cola.enCola(destino.clave()) { responder(consultarEstado(destino)) }
    }

    private fun consultarEstado(destino: Destino): JSONObject = try {
        val lectura = servicios.fabrica.crear(destino).consultarEstado(ESPERA_ESTADO_MS)
        if (!lectura.contesto()) {
            JSONObject().put("soportado", false).put("mensaje", "Esta impresora no contestó la consulta de estado (algunas no la tienen)")
        } else {
            JSONObject().put("soportado", true).apply {
                lectura.enLinea?.let { put("enLinea", it) }
                lectura.sinPapel?.let { put("sinPapel", it) }
                lectura.tapaAbierta?.let { put("tapaAbierta", it) }
            }
        }
    } catch (error: Throwable) {
        val traducido: ErrorDeImpresora = TraductorDeErrores.traducir(error, ESPERA_ESTADO_MS)
        JSONObject().put("soportado", false).put("mensaje", traducido.message)
    }

    private companion object {
        const val ESPERA_ESTADO_MS = 1_500L
    }
}

package mx.morphiq.pos.app.logica

import org.json.JSONObject

/**
 * Los topes de tamaño de lo que acepta el puente. Existen para que una página (propia o
 * comprometida) no pueda agotar la memoria de un aparato de 2 GB ni dejar la cola ocupada con un
 * documento absurdo. Cada uno es una constante con su razón; pasarse da un rechazo `ARGUMENTOS`.
 */
object Topes {
    /**
     * Bytes máximos de UN documento ya decodificado. Un ticket de 80 mm rasterizado (576 puntos de
     * ancho = 72 bytes por fila) de 30 cm de largo pesa ~170 KB; 4 MiB alcanzan para ~7 m de papel,
     * mucho más que cualquier comanda real, y caben sin riesgo en el montón de un aparato de 2 GB.
     */
    const val MAX_BYTES_DOCUMENTO = 4 * 1024 * 1024

    /** El pulso del cajón son ~5 bytes (`ESC p m t1 t2`); 1 KiB deja de sobra para perfiles raros. */
    const val MAX_BYTES_PULSO = 1024

    /** Los ajustes del aparato son un perfil de impresión y dos banderas: ~1 KB. 64 KiB es holgura de sobra. */
    const val MAX_BYTES_AJUSTES = 64 * 1024

    /**
     * Caracteres máximos de la llamada completa al plugin: dos documentos en base64 (el que se
     * imprime y el que se «recuerda») más sus campos. Se revisa ANTES de volver a leerla como JSON.
     */
    const val MAX_CARACTERES_LLAMADA = 2 * ((MAX_BYTES_DOCUMENTO + 2) / 3 * 4) + 64 * 1024

    /** Caracteres de base64 que caben en [maxBytes] bytes (con el relleno `=`), sin decodificar nada. */
    fun maxCaracteresBase64(maxBytes: Int): Int = (maxBytes + 2) / 3 * 4

    /** `true` si un base64 de [largo] caracteres no puede pasarse de [maxBytes] al decodificarse. */
    fun base64Cabe(largo: Int, maxBytes: Int): Boolean = largo <= maxCaracteresBase64(maxBytes)

    /** `true` si los ajustes (ya mezclados) pesan, en UTF-8, [MAX_BYTES_AJUSTES] o menos. */
    fun ajustesCaben(ajustes: JSONObject): Boolean {
        val texto = ajustes.toString()
        // Un carácter pesa a lo más 3 bytes en UTF-8 dentro del BMP: si ni así se pasa, no hace falta codificar.
        if (texto.length * 3 <= MAX_BYTES_AJUSTES) return true
        return texto.toByteArray(Charsets.UTF_8).size <= MAX_BYTES_AJUSTES
    }

    fun llamadaCabe(caracteres: Int): Boolean = caracteres <= MAX_CARACTERES_LLAMADA

    /** «4 MB», «1 KB»: el tope como lo lee una persona. */
    fun legible(bytes: Int): String = when {
        bytes >= 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
        else -> "${bytes / 1024} KB"
    }
}

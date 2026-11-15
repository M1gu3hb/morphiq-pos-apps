package mx.morphiq.pos.app.logica

/** La impresora integrada de los POS tipo Sunmi aparece emparejada en Bluetooth como «InnerPrinter». */
object InnerPrinter {
    fun esPorNombre(nombre: String?): Boolean {
        if (nombre == null) return false
        val limpio = nombre.filter { it.isLetterOrDigit() }.lowercase()
        return limpio == "innerprinter" || limpio.startsWith("innerprinter")
    }
}

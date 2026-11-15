package mx.morphiq.pos.app.logica

import java.io.IOException
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

/** Socket TCP a host:9100 (puerto crudo de las impresoras térmicas de red). */
class TransporteRed(private val host: String, private val puerto: Int) : Transporte {

    override fun enviar(bytes: ByteArray, opciones: OpcionesDeEnvio, alProgreso: (Int) -> Unit) {
        val socket = try {
            abrir(opciones.esperaMs)
        } catch (error: IOException) {
            throw TraductorDeErrores.traducir(error, opciones.esperaMs)
        }
        val vigilante = VigilanteDeTiempo(opciones.esperaMs) { socket.close() }.iniciar()
        try {
            socket.use {
                EnvioPorBloques.escribir(it.getOutputStream(), bytes, opciones) { enviados ->
                    vigilante.latir()
                    alProgreso(enviados)
                }
            }
        } catch (error: IOException) {
            throw if (vigilante.agotado) TraductorDeErrores.tiempo(opciones.esperaMs, error) else TraductorDeErrores.traducir(error, opciones.esperaMs)
        } finally {
            vigilante.close()
        }
    }

    override fun consultarEstado(esperaMs: Long): EstadoEscPos {
        try {
            abrir(esperaMs).use { socket ->
                val salida = socket.getOutputStream()
                val entrada = socket.getInputStream()
                val respuestas = intArrayOf(1, 2, 4).map { n ->
                    salida.write(EscPos.consultaDeEstado(n))
                    salida.flush()
                    leerUnByte(entrada)
                }
                return EscPos.decodificarEstado(respuestas[0], respuestas[1], respuestas[2])
            }
        } catch (error: IOException) {
            throw TraductorDeErrores.traducir(error, esperaMs)
        }
    }

    private fun abrir(esperaMs: Long): Socket {
        val socket = Socket()
        try {
            socket.tcpNoDelay = true
            socket.soTimeout = esperaMs.toInt()
            socket.connect(InetSocketAddress(host, puerto), esperaMs.toInt())
        } catch (error: IOException) {
            socket.close()
            throw error
        }
        return socket
    }

    /** Un byte de respuesta, o `null` si la impresora no contesta dentro del tiempo del socket. */
    private fun leerUnByte(entrada: InputStream): Int? = try {
        entrada.read().takeIf { it >= 0 }
    } catch (error: SocketTimeoutException) {
        null
    }
}

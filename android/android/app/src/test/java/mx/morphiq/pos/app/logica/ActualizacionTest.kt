package mx.morphiq.pos.app.logica

import java.io.File
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ActualizacionTest {
    @get:Rule val carpeta = TemporaryFolder()

    private val sha = "a".repeat(64)

    private fun json(codigo: String = "12", apk: String = "POS-Don-Poncho-0.2.0.apk", hash: String = sha) =
        """{ "versionCode": $codigo, "version": "0.2.0", "apk": "$apk", "sha256": "$hash", "notas": "Mejoras" }"""

    // ---- Comparación de versiones ----

    @Test fun `solo un versionCode MAYOR es una actualizacion`() {
        assertTrue(Actualizacion.hayNueva(2, 1))
        assertFalse(Actualizacion.hayNueva(1, 1))
        assertFalse(Actualizacion.hayNueva(1, 2))
    }

    // ---- android.json ----

    @Test fun `lee un android json completo`() {
        val (info, motivo) = Actualizacion.leer(json())
        assertNull(motivo)
        assertEquals(InfoDeActualizacion(12, "0.2.0", "POS-Don-Poncho-0.2.0.apk", sha, "Mejoras"), info)
    }

    @Test fun `el sha256 se guarda en minusculas`() {
        val (info, _) = Actualizacion.leer(json(hash = "ABCDEF0123".repeat(6) + "ABCD"))
        assertEquals(("abcdef0123".repeat(6) + "abcd"), info!!.sha256)
    }

    @Test fun `un android json roto o incompleto se rechaza con su motivo`() {
        assertNull(Actualizacion.leer("esto no es json").first)
        assertNotNull(Actualizacion.leer("esto no es json").second)
        assertNull(Actualizacion.leer("{}").first)
        assertNull(Actualizacion.leer(json(codigo = "0")).first)
        assertNull(Actualizacion.leer(json(codigo = "-3")).first)
        assertNull(Actualizacion.leer(json(hash = "abc")).first)
        assertNull(Actualizacion.leer(json(hash = "z".repeat(64))).first)
    }

    @Test fun `el nombre del APK no puede salirse de la carpeta ni ser otra cosa`() {
        assertNull(Actualizacion.leer(json(apk = "../evil.apk")).first)
        assertNull(Actualizacion.leer(json(apk = "sub/dir.apk")).first)
        assertNull(Actualizacion.leer(json(apk = "malo.exe")).first)
        assertNull(Actualizacion.leer(json(apk = "https://evil.com/a.apk")).first)
        assertNull(Actualizacion.leer(json(apk = "")).first)
    }

    @Test fun `el APK esta en la misma carpeta que android json`() {
        assertEquals(
            "https://github.com/M1gu3hb/morphiq-pos-apps/releases/download/canal-don-poncho/POS.apk",
            Actualizacion.urlDelApk("https://github.com/M1gu3hb/morphiq-pos-apps/releases/download/canal-don-poncho/android.json", "POS.apk"),
        )
    }

    // ---- A dónde se puede ir a descargar ----

    @Test fun `github y sus servidores de archivos por https son permitidos`() {
        assertTrue(Actualizacion.urlDeDescargaPermitida("https://github.com/M1gu3hb/x/releases/download/c/android.json"))
        assertTrue(Actualizacion.urlDeDescargaPermitida("https://objects.githubusercontent.com/github-production-release-asset/1"))
        assertTrue(Actualizacion.urlDeDescargaPermitida("https://release-assets.githubusercontent.com/a/b"))
    }

    @Test fun `http, otros hosts y trampas NO son permitidos`() {
        assertFalse(Actualizacion.urlDeDescargaPermitida("http://github.com/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://github.com.evil.com/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://evil.com/?u=github.com"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://githubusercontent.com/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://evilgithubusercontent.com/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://github.com@evil.com/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("https://github.com:8443/x"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("file:///sdcard/a.apk"))
        assertFalse(Actualizacion.urlDeDescargaPermitida("no es url"))
    }

    // ---- 1.0.1 sobre 1.0.0 ----

    @Test fun `la version 1 0 1 (codigo 3) es mas nueva que la 1 0 0 (codigo 2) y se anuncia con ese codigo`() {
        assertTrue(Actualizacion.hayNueva(codigoNuevo = 3, codigoActual = 2))
        assertFalse("la misma version no se reinstala", Actualizacion.hayNueva(3, 3))
        assertFalse("nunca se baja de version", Actualizacion.hayNueva(2, 3))
        val sha = "a".repeat(64)
        val (info, motivo) = Actualizacion.leer("""{"versionCode":3,"version":"1.0.1","apk":"POS-Don-Poncho-1.0.1.apk","sha256":"$sha","notas":"Versión 1.0.1"}""")
        assertNull(motivo)
        assertEquals(3, info!!.versionCode)
        assertEquals("1.0.1", info.version)
        assertTrue(Actualizacion.hayNueva(info.versionCode, codigoActual = 2))
    }

    // ---- sha256 ----

    private fun sha256De(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    @Test fun `el sha256 de un archivo conocido es el correcto`() {
        // SHA-256 de «abc» (vector de la especificación).
        val abc = carpeta.newFile("abc.bin").apply { writeText("abc") }
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Actualizacion.sha256(abc.inputStream()))
    }

    @Test fun `un archivo que coincide con su sha256 se acepta, aunque venga en mayusculas`() {
        val contenido = ByteArray(200_000) { (it * 7).toByte() }
        val apk = carpeta.newFile("ok.apk").apply { writeBytes(contenido) }
        assertTrue(Actualizacion.coincideSha256(apk, sha256De(contenido)))
        assertTrue(Actualizacion.coincideSha256(apk, sha256De(contenido).uppercase()))
    }

    @Test fun `un archivo alterado o truncado NO coincide`() {
        val contenido = ByteArray(1000) { it.toByte() }
        val esperado = sha256De(contenido)
        val alterado = carpeta.newFile("alterado.apk").apply { writeBytes(contenido.also { it[10] = 99 }) }
        val truncado: File = carpeta.newFile("truncado.apk").apply { writeBytes(ByteArray(500) { it.toByte() }) }
        assertFalse(Actualizacion.coincideSha256(alterado, esperado))
        assertFalse(Actualizacion.coincideSha256(truncado, esperado))
        assertFalse(Actualizacion.coincideSha256(carpeta.newFile("vacio.apk"), esperado))
    }
}

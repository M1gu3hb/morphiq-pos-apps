package mx.morphiq.pos.app.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrigenPermitidoTest {
    private val dominio = "pos-don-poncho.vercel.app"

    private fun permitido(url: String?) = OrigenPermitido.esPermitido(url, dominio)

    @Test fun `el POS de produccion con cualquier ruta es permitido`() {
        assertTrue(permitido("https://pos-don-poncho.vercel.app"))
        assertTrue(permitido("https://pos-don-poncho.vercel.app/n/don-poncho/login-pos"))
        assertTrue(permitido("https://pos-don-poncho.vercel.app/a?x=1#y"))
    }

    @Test fun `mayusculas en esquema y host no cambian nada`() {
        assertTrue(permitido("HTTPS://POS-Don-Poncho.Vercel.App/"))
    }

    @Test fun `las pantallas internas en https localhost son permitidas`() {
        assertTrue(permitido("https://localhost"))
        assertTrue(permitido("https://localhost/diagnostico.html"))
    }

    @Test fun `el dominio dentro de otro dominio NO es permitido`() {
        assertFalse(permitido("https://pos-don-poncho.vercel.app.evil.com"))
        assertFalse(permitido("https://pos-don-poncho.vercel.app.evil.com/login"))
        assertFalse(permitido("https://evilpos-don-poncho.vercel.app"))
    }

    @Test fun `el dominio escondido en la ruta, la consulta o el usuario NO es permitido`() {
        assertFalse(permitido("https://evil.com/?u=pos-don-poncho.vercel.app"))
        assertFalse(permitido("https://evil.com/pos-don-poncho.vercel.app"))
        assertFalse(permitido("https://evil.com#pos-don-poncho.vercel.app"))
        assertFalse(permitido("https://pos-don-poncho.vercel.app@evil.com/"))
    }

    @Test fun `http del mismo host NO es permitido`() {
        assertFalse(permitido("http://pos-don-poncho.vercel.app"))
        assertFalse(permitido("http://localhost"))
    }

    @Test fun `otro subdominio de vercel NO es permitido`() {
        assertFalse(permitido("https://otro-pos.vercel.app"))
        assertFalse(permitido("https://vercel.app"))
        assertFalse(permitido("https://www.pos-don-poncho.vercel.app"))
    }

    @Test fun `otro puerto o un punto final cambian el origen`() {
        assertFalse(permitido("https://pos-don-poncho.vercel.app:8443"))
        assertTrue(permitido("https://pos-don-poncho.vercel.app:443"))
        assertFalse(permitido("https://pos-don-poncho.vercel.app./"))
        assertFalse(permitido("https://localhost:3000"))
    }

    @Test fun `esquemas ajenos no son permitidos`() {
        assertFalse(permitido("file:///android_asset/index.html"))
        assertFalse(permitido("javascript:alert(1)"))
        assertFalse(permitido("data:text/html,hola"))
        assertFalse(permitido("intent://pos-don-poncho.vercel.app#Intent;end"))
    }

    @Test fun `url vacia, nula o invalida NO es permitida`() {
        assertFalse(permitido(null))
        assertFalse(permitido(""))
        assertFalse(permitido("   "))
        assertFalse(permitido("no es una url"))
        assertFalse(permitido("https://"))
        assertFalse(permitido("https://evil.com\\@pos-don-poncho.vercel.app/"))
        assertFalse(permitido("about:blank"))
    }

    @Test fun `un dominio en blanco nunca permite nada del POS`() {
        assertFalse(OrigenPermitido.esPermitido("https://pos-don-poncho.vercel.app", ""))
    }

    @Test fun `los origenes de inyeccion son el dominio y localhost`() {
        assertEquals(setOf("https://pos-don-poncho.vercel.app", "https://localhost"), OrigenPermitido.origenes("Pos-Don-Poncho.vercel.app"))
    }

    @Test fun `una pantalla interna se distingue del POS`() {
        assertTrue(OrigenPermitido.esLocal("https://localhost/diagnostico.html"))
        assertTrue(OrigenPermitido.esLocal("HTTPS://LOCALHOST"))
        assertFalse(OrigenPermitido.esLocal("https://pos-don-poncho.vercel.app/"))
        assertFalse(OrigenPermitido.esLocal("http://localhost"))
        assertFalse(OrigenPermitido.esLocal("https://localhost.evil.com"))
        assertFalse(OrigenPermitido.esLocal(null))
        assertFalse(OrigenPermitido.esLocal("no es url"))
    }
}

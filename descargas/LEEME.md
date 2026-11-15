# Descargas

La página para bajar las apps de un cliente desde cualquier navegador, aunque sea viejo: en los POS,
abrir Chrome, teclear la dirección corta y descargar. **Don Poncho:** <https://don-poncho-apps.vercel.app>

| Ruta | Qué hace |
| --- | --- |
| `/` | Logo, nombre, los dos botones (con versión, fecha y tamaño), el QR, cómo instalar y las huellas SHA-256. |
| `/windows` | 302 al `.exe` de la versión más nueva. |
| `/android` | 302 al `.apk` de la versión más nueva. |
| `/robots.txt` | No se indexa nada (también va `noindex` en la meta y en `X-Robots-Tag`). |

## Los archivos no viven aquí

Se bajan de los GitHub Releases de este repo. La función encuentra la versión más nueva así:

1. **El canal** `canal-<cliente>`, lo mismo que leen las apps instaladas: `latest.yml` (Windows) y
   `android.json`. El archivo se ofrece del release `<cliente>-vX.Y.Z` de esa versión, y antes se
   comprueba con un HEAD que exista.
2. Si el canal falla, la release `<cliente>-v*` más nueva por la **API pública** de GitHub.
3. Si GitHub falla, **la última que conoce**: la de la memoria o, si la función acaba de arrancar,
   la que se tomó al construir. Nunca un error en blanco.

A GitHub se le pregunta cuando mucho cada **5 minutos** (y al minuto si algo falló), sin token. Cuando
salga la 1.0.1, la página la ofrece sola: no hay que desplegar nada.

## Lo que la página sabe del aparato

Por el *user agent* (y, en Chrome, por la pista `Sec-CH-UA-Platform-Version`, porque Chrome ya dice
«Windows NT 10.0» hasta en Windows 7):

- Resalta el botón de su sistema («Para este aparato») y lo pone primero.
- Windows 7, 8 u 8.1: «Esta app necesita Windows 10 o más nuevo».
- Android menor a la 6: «Necesita Android 6 o más nuevo».
- iPhone o iPad: «En iPhone no se instala: abre el POS en Safari y usa “Agregar a inicio”», con el
  link al POS.

## Pensada para los POS viejos

HTML y CSS hechos en el servidor, **sin JavaScript** (la descarga es un enlace normal), sin fuentes
externas ni animaciones, sin variables CSS ni `grid`. Texto grande, botones de 64 px. La página
entera pesa unos 25 KB (el logo se reduce al construir).

## Otro cliente

Todo sale de `clientes/<id>.json` (nombre, colores, logo, ícono, URL del POS, repo y canal). Para otro
cliente: un proyecto nuevo en Vercel conectado a este repo, con *Root Directory* `descargas` y la
variable `CLIENTE=<id>`.

## Probar

```bash
npm ci
CLIENTE=don-poncho npm run build
npm test
npm run e2e
```

`npm run e2e` levanta un GitHub falso con la versión 9.9.9 (comprueba que la página la ofrece sin
desplegar) y una copia con GitHub caído (comprueba que usa la última conocida). Contra producción:

```bash
BASE_URL=https://don-poncho-apps.vercel.app npm run e2e
BASE_URL=https://don-poncho-apps.vercel.app npm run humo
```

`npm run humo` sigue los 302 hasta el archivo real y comprueba que existe (HEAD 200) y su tamaño.

## Vercel

- Proyecto `don-poncho-apps` del equipo `mh-astral-systems`, *Root Directory* `descargas`, rama
  `main`. Variable `CLIENTE=don-poncho` (no es secreta). **No hay tokens ni secretos.**
- `construir.mjs` deja todo en `.vercel/output` (Build Output API): los estáticos en `static/` y una
  sola función en `functions/index.func/`.
- Sólo se despliega cuando cambia `descargas/` o `clientes/` (`ignoreCommand` de `vercel.json`).
- **Volver atrás:** en Vercel, *Deployments* → el despliegue anterior → *Instant Rollback*. Una
  versión mala de la app se arregla en los Releases, no aquí.

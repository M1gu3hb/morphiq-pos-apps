/**
 * EL PUENTE `window.MorphiqApp` · versión 1
 *
 * La MISMA interfaz en la app de Windows (Electron) y en la de Android (Capacitor). La página del
 * POS pregunta si `window.MorphiqApp` existe: si existe, imprime directo y abre el cajón; si no,
 * sigue con el diálogo del navegador.
 *
 * Reglas que cumplen las dos apps:
 *
 *  1. El puente se expone SÓLO a la página de producción del cliente (`clientes/<id>.json` →
 *     `dominio`, siempre por https) y a las pantallas internas de la propia app (Diagnóstico,
 *     Sin internet, Acerca de). Cada llamada vuelve a comprobar el origen de quien llama; si no es
 *     uno permitido, se rechaza con `ORIGEN`.
 *  2. El puente NO da acceso a archivos ni a comandos del sistema: sólo imprimir, cajón,
 *     diagnóstico, ajustes del aparato y actualización. LA ÚNICA EXCEPCIÓN (Windows 1.0.2) es
 *     `archivos`: guardar el PDF de un corte y abrir la carpeta donde se guardan, con TRES cerrojos:
 *       a) SÓLO PDF: el contenido debe empezar con la firma `%PDF-` y no pasar de 20 MiB.
 *       b) SÓLO esa carpeta: `Documentos\POS Don Poncho\Cortes\AAAA-MM\`. La página NO da nombre ni
 *          ruta: da el folio y la fecha del corte, la app los valida con expresiones estrictas y arma
 *          ella `Corte-<folio>-<AAAA-MM-DD>.pdf`; y comprueba que el destino quede dentro de la carpeta.
 *          `abrirCarpeta()` no recibe ruta: abre esa carpeta y ninguna otra.
 *       c) SÓLO el origen de producción: a diferencia del resto del puente, ni siquiera las pantallas
 *          internas de la app pueden llamarlas (rechazo `ORIGEN`).
 *     No hay lectura, listado, borrado ni otra ruta de escritura. La Android 1.0.1 y la Windows
 *     1.0.1 no traen `archivos`: la página lo sabe por `capacidades` (ver `MorphiqApp.capacidades`).
 *  3. Las apps son TRANSPORTE: la página arma los bytes (ESC/POS como imagen o como texto, el
 *     corte, el pulso del cajón) y la app los entrega a la impresora. Lo único que las apps
 *     saben armar solas es la página de prueba mínima y el pulso del cajón (para probar antes de
 *     que exista un perfil y para reimprimir sin internet).
 *  4. Todo método devuelve una promesa. Ninguno lanza por un fallo de la impresora: el fallo
 *     viene en el resultado (`ok: false`, `codigo`, `mensaje`). Sólo se rechaza la promesa por un
 *     mal uso (argumentos inválidos) o por `ORIGEN`.
 *  5. Los textos de `mensaje` van en español, cortos y sin tecnicismos; el `codigo` es estable.
 *  6. Cuando una promesa SÍ se rechaza (mal uso u `ORIGEN`), el rechazo es un objeto plano
 *     `{ name, codigo, message }` con `codigo` en `ORIGEN`, `ARGUMENTOS` o `DESCONOCIDO`, y no
 *     necesariamente un `Error`: el aislamiento de contexto de Electron sólo deja pasar así el
 *     código. Quien llama lee `message` del objeto, no pregunta `instanceof Error`.
 *
 * Ajustes que las apps leen además de los de `Ajustes`: `primerArranqueHecho` (las dos),
 * `verificarSpooler` (Windows: `false` deja de preguntar al spooler si la impresora está lista
 * antes de imprimir) y `pantallaDeInicio` (Android: la app como pantalla de inicio del aparato).
 */

export type Plataforma = 'windows' | 'android';

/** Por dónde se le habla a la impresora. Lo que una plataforma no puede lo dice `conexiones()`. */
export type Conexion =
  /** Windows · impresora instalada, bytes en crudo (RAW) por el spooler. */
  | 'spooler'
  /** Windows · impresión normal por el driver, sin diálogo. Sólo documentos `html`. */
  | 'driver'
  /** Las dos · socket TCP (puerto 9100 por omisión). */
  | 'red'
  /** Android · USB directo (UsbManager, transferencia bulk). */
  | 'usb'
  /** Android · Bluetooth SPP/RFCOMM (incluye el «InnerPrinter» de los POS tipo Sunmi). */
  | 'bluetooth'
  /** Windows · puerto serie (COMx). */
  | 'serial';

export interface Destino {
  readonly conexion: Conexion;
  /** `spooler` y `driver`: el nombre exacto de la impresora instalada en Windows. */
  readonly nombre?: string;
  /** `red`: IP o nombre, y puerto (9100 si falta). */
  readonly host?: string;
  readonly puerto?: number;
  /** `usb`: los identificadores del aparato. */
  readonly vendorId?: number;
  readonly productId?: number;
  /** `bluetooth`: la dirección MAC del aparato emparejado. */
  readonly direccion?: string;
  /** `serial`: `COM3` y baudios (9600 si falta). */
  readonly puertoSerie?: string;
  readonly baudios?: number;
}

export interface Impresora {
  /** Estable entre arranques: `spooler:EPSON TM-T20`, `usb:1155:22339`, `bluetooth:00:11:22:33:44:55`. */
  readonly id: string;
  readonly nombre: string;
  readonly destino: Destino;
  /** Para leer: el puerto de Windows (`USB001`, `COM3`), el driver, «InnerPrinter»… */
  readonly detalle?: string;
  readonly predeterminada?: boolean;
  /** Android · USB: `true` si el aparato se anuncia como impresora (clase 7). */
  readonly esImpresora?: boolean;
  /** Android · USB y Bluetooth: `false` si falta el permiso del sistema para usarla. */
  readonly conPermiso?: boolean;
}

export interface Diagnostico {
  readonly app: { readonly nombre: string; readonly version: string; readonly cliente: string };
  readonly plataforma: Plataforma;
  readonly sistema: {
    /** «Windows 10 Pro», «Android 11». */
    readonly nombre: string;
    /** «10.0.19045», «11 (API 30)». */
    readonly version: string;
    readonly bits: 32 | 64;
    /** Android: marca, modelo y aparato («SUNMI», «V2_PRO»). En Windows, fabricante y modelo si se saben. */
    readonly marca?: string;
    readonly modelo?: string;
  };
  readonly memoria: { readonly totalMb: number; readonly libreMb: number };
  readonly procesador: { readonly nombre: string; readonly nucleos: number; readonly arquitectura: string };
  readonly pantalla: {
    readonly anchoPx: number;
    readonly altoPx: number;
    readonly escala: number;
    readonly tactil: boolean;
  };
  /** El motor que pinta la página: Chromium de Electron o el WebView del sistema en Android. */
  readonly navegador: { readonly nombre: string; readonly version: string };
  readonly impresoras: readonly Impresora[];
  /** Android: los Bluetooth emparejados (impresoras o no), con su nombre y MAC. */
  readonly bluetooth?: readonly { readonly nombre: string; readonly direccion: string; readonly esInnerPrinter: boolean }[];
  /** Android: todos los USB conectados. */
  readonly usb?: readonly {
    readonly nombre: string;
    readonly vendorId: number;
    readonly productId: number;
    readonly clase: number;
    readonly esImpresora: boolean;
  }[];
  /** Android: servicios de impresión de la marca que están instalados («sunmi», «imin»). */
  readonly serviciosDeMarca?: readonly string[];
  readonly modoLigero: ModoLigero;
  /** Lo que no se pudo leer y por qué («Bluetooth: falta el permiso»). Nunca se inventa un dato. */
  readonly avisos: readonly string[];
}

export interface ModoLigero {
  readonly activo: boolean;
  /** `auto`: lo decidió la app por la RAM y el procesador; `manual`: lo fijó alguien en ajustes. */
  readonly origen: 'auto' | 'manual';
  readonly motivo: string;
}

/**
 * Los ajustes viven EN EL APARATO (cada POS tiene su impresora). La app guarda el objeto tal
 * cual; `perfil` es de la página (la app no lo interpreta, salvo `perfil.destino` y
 * `perfil.cajon` para la página de prueba, el cajón y la reimpresión sin internet).
 */
export interface Ajustes {
  /** Sube cuando cambia la forma. Hoy 1. */
  readonly version: 1;
  readonly perfil: PerfilDeImpresion | null;
  /** `null` = automático. */
  readonly modoLigero: boolean | null;
  /** Sólo Windows. */
  readonly arrancarConElSistema?: boolean;
  readonly pantallaCompleta?: boolean;
  readonly aceleracionGpu?: boolean;
  /** Cualquier otra llave que la página quiera guardar en el aparato. */
  readonly [otra: string]: unknown;
}

export interface PerfilDeImpresion {
  readonly nombre: string;
  readonly destino: Destino;
  /** El pulso del cajón ya armado por la página (base64), o `null` si este aparato no tiene cajón. */
  readonly cajon: { readonly base64: string } | null;
  /** Lo demás (lenguaje, ancho en puntos, dpi, corte, bloques…) es de la página. */
  readonly [otra: string]: unknown;
}

/** Bytes ya armados por la página. La app sólo los entrega, en bloques y con pausa. */
export interface DocumentoCrudo {
  readonly tipo: 'crudo';
  readonly base64: string;
  /** Tamaño de cada bloque en bytes (4096 si falta) y pausa entre bloques en ms (0 si falta). */
  readonly bloqueBytes?: number;
  readonly pausaMs?: number;
}

/** Sólo Windows con `driver`: una página HTML completa que se imprime sin diálogo. */
export interface DocumentoHtml {
  readonly tipo: 'html';
  readonly html: string;
  readonly anchoMm: number;
}

export interface Trabajo {
  /**
   * El id del trabajo lo pone la página. La app recuerda los últimos 50 ids ENTREGADOS: si llega
   * uno repetido no imprime otra vez y responde `estado: 'duplicado'`. Un reintento de un
   * trabajo que falló sí vuelve a imprimir.
   */
  readonly id: string;
  /** Si falta, el del perfil guardado. */
  readonly destino?: Destino;
  readonly documento: DocumentoCrudo | DocumentoHtml;
  /** Copias idénticas (1 si falta). Las copias con pie distinto las arma la página en un solo documento. */
  readonly copias?: number;
  /** Cuánto esperar a la impresora antes de responder `TIEMPO` (10 000 ms si falta). */
  readonly esperaMs?: number;
  /**
   * Si viene, la app guarda este documento como «el último ticket» del aparato, para
   * `reimprimirUltimo()` aunque no haya internet. Va el documento que debe salir al REIMPRIMIR
   * (la página ya le puso «REIMPRESIÓN»); la app sólo le antepone un renglón de texto simple con
   * la fecha y la hora.
   */
  readonly recordar?: { readonly titulo: string; readonly documento: DocumentoCrudo };
}

export type CodigoDeError =
  | 'ORIGEN'
  | 'SIN_PERFIL'
  | 'NO_SOPORTADO'
  | 'SIN_PERMISO'
  | 'DESCONECTADA'
  | 'SIN_PAPEL'
  | 'TAPA_ABIERTA'
  | 'TIEMPO'
  | 'CANCELADO'
  | 'DESCONOCIDO';

export interface Resultado {
  readonly ok: boolean;
  readonly id: string;
  /**
   * `impreso`: la impresora lo confirmó. `enviado`: los bytes salieron y la impresora no
   * confirma (lo normal por spooler, USB y Bluetooth). `duplicado`: ese id ya se había entregado.
   */
  readonly estado: 'impreso' | 'enviado' | 'duplicado' | 'error';
  readonly codigo?: CodigoDeError;
  readonly mensaje?: string;
  readonly bytes?: number;
  readonly ms?: number;
}

export interface EstadoDeImpresora {
  /** `false` si por esa conexión no se puede preguntar (se dice por qué en `mensaje`). */
  readonly soportado: boolean;
  readonly enLinea?: boolean;
  readonly sinPapel?: boolean;
  readonly tapaAbierta?: boolean;
  readonly cajonAbierto?: boolean;
  readonly mensaje?: string;
}

export interface Actualizacion {
  readonly estado: 'al-dia' | 'disponible' | 'descargando' | 'lista' | 'error';
  readonly versionActual: string;
  readonly versionNueva?: string;
  readonly avance?: number;
  readonly mensaje?: string;
}

export interface CapacidadDeConexion {
  readonly conexion: Conexion;
  readonly disponible: boolean;
  /** Por qué no, en una frase («El driver de Windows no existe en Android»). */
  readonly motivo?: string;
}

/** Lo que la app sabe hacer además del contrato base. `archivos`: Windows 1.0.2 en adelante. */
export type Capacidad = 'archivos';

/** Lo que la página manda para guardar el PDF de un corte. Nada más se acepta (ni ruta, ni nombre). */
export interface CorteParaGuardar {
  /** El folio como lo lee la persona («DPC-0102», «CC-2»): letras y números, hasta 3 tramos con guion, 24 caracteres. */
  readonly folio: string;
  /** `AAAA-MM-DD`, una fecha real del calendario; de ella sale la carpeta del mes. */
  readonly fecha: string;
  /** El PDF en base64 (empieza con `%PDF-`, hasta 20 MiB ya decodificado). */
  readonly base64: string;
}

export type CodigoDeArchivo =
  /** Folio, fecha o base64 inválidos, o la página mandó llaves de más (ruta, nombre…). */
  | 'ARGUMENTOS'
  | 'NO_ES_PDF'
  | 'MUY_GRANDE'
  /** El destino quedaba fuera de la carpeta de cortes (no debería pasar; se rechaza). */
  | 'FUERA_DE_CARPETA'
  /** El disco o el Explorador fallaron (archivo abierto en otro programa, sin permiso…). */
  | 'NO_SE_PUDO';

export type ResultadoDeGuardado =
  | {
      readonly ok: true;
      /** `guardado`: archivo nuevo · `ya-estaba`: el mismo corte con el mismo contenido (no se reescribe) · `reemplazado`: el mismo corte, otro PDF. */
      readonly estado: 'guardado' | 'ya-estaba' | 'reemplazado';
      /** La ruta completa donde quedó, para mostrarla. */
      readonly ruta: string;
      readonly bytes: number;
    }
  | { readonly ok: false; readonly codigo: CodigoDeArchivo; readonly mensaje: string };

export type ResultadoDeCarpeta =
  | { readonly ok: true; readonly ruta: string }
  | { readonly ok: false; readonly codigo: 'NO_SE_PUDO'; readonly mensaje: string };

/** Windows 1.0.2. Ninguna función lanza por un fallo: el motivo viene en el resultado. */
export interface ArchivosDeCortes {
  /** Guarda el PDF en `Documentos\POS Don Poncho\Cortes\AAAA-MM\Corte-<folio>-<fecha>.pdf`. Guardar el mismo corte otra vez no duplica. */
  guardar(corte: CorteParaGuardar): Promise<ResultadoDeGuardado>;
  /** Abre en el Explorador `Documentos\POS Don Poncho\Cortes` (la crea si falta). SIN parámetros: no acepta ruta. */
  abrirCarpeta(): Promise<ResultadoDeCarpeta>;
}

export type Evento =
  /** `{ id, enviados, total }` mientras sale un trabajo. */
  | 'progreso'
  /** Un `Actualizacion` cada vez que cambia. */
  | 'actualizacion'
  /** `{ activo }` cuando cambia el modo ligero. */
  | 'modo-ligero';

export interface MorphiqApp {
  /** Versión del contrato. Hoy 1. */
  readonly contrato: 1;
  /**
   * Lo que esta app sabe hacer además del contrato base. SÓLO existe desde la Windows 1.0.2: si falta
   * (1.0.1, Android), la página no ofrece lo que dependa de ello. Hoy: `['archivos']` en Windows 1.0.2.
   */
  readonly capacidades?: readonly Capacidad[];
  /** Presente sólo si `capacidades` incluye `'archivos'`. Ver la regla 2 de arriba. */
  readonly archivos?: ArchivosDeCortes;

  version(): Promise<string>;
  plataforma(): Promise<Plataforma>;
  diagnostico(): Promise<Diagnostico>;

  impresoras(): Promise<readonly Impresora[]>;
  /** Qué conexiones puede usar esta plataforma, y por qué no las demás. */
  conexiones(): Promise<readonly CapacidadDeConexion[]>;
  /** Pide al sistema el permiso que falte para esa impresora (USB, Bluetooth). */
  pedirPermiso(destino: Destino): Promise<{ readonly concedido: boolean; readonly mensaje?: string }>;

  ajustes(): Promise<Ajustes>;
  /** Mezcla superficial sobre lo guardado y devuelve el resultado. */
  guardarAjustes(parche: Partial<Ajustes>): Promise<Ajustes>;

  imprimir(trabajo: Trabajo): Promise<Resultado>;
  /** El pulso del cajón del perfil guardado (o `ESC p 0 25 250` por el destino dado). */
  abrirCajon(opciones?: { readonly destino?: Destino; readonly base64?: string }): Promise<Resultado>;
  /** Una página mínima en texto simple, armada por la app, para saber si la conexión sirve. */
  paginaDePrueba(opciones?: { readonly destino?: Destino }): Promise<Resultado>;
  /** `DLE EOT` por las conexiones que dejan leer la respuesta. */
  estado(opciones?: { readonly destino?: Destino }): Promise<EstadoDeImpresora>;
  /** Reimprime la copia local del último ticket; funciona sin internet. */
  reimprimirUltimo(): Promise<Resultado>;
  ultimoTicket(): Promise<{ readonly titulo: string; readonly guardadoEn: string } | null>;

  buscarActualizacion(): Promise<Actualizacion>;
  instalarActualizacion(): Promise<Actualizacion>;

  modoLigero(): Promise<ModoLigero>;

  /** Pantallas internas de la app. */
  abrirPos(): Promise<void>;
  abrirDiagnostico(): Promise<void>;

  /** Se suscribe a un evento; devuelve la función que lo quita. */
  escuchar(evento: Evento, alLlegar: (datos: unknown) => void): () => void;
}

declare global {
  interface Window {
    MorphiqApp?: MorphiqApp;
  }
}

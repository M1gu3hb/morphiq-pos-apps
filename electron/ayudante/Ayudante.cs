// Ayudante de impresión de la app de Windows. Un solo archivo, C# 5 (.NET Framework 4).
// Habla con el spooler (winspool.drv) y con puertos serie; no hay módulos nativos de Node.
//
//   ayudante listar
//   ayudante crudo "<impresora>" <archivo> [bloqueBytes] [pausaMs]
//   ayudante serie <COMx> <baudios> <archivo> [bloqueBytes] [pausaMs]
//   ayudante estado "<impresora>"
//
// Salida: JSON de UNA línea, sólo ASCII. Al fallar: {"ok":false,"codigo":...,"mensaje":...} y código 1.
// `crudo` y `serie` imprimen además {"enviados":n,"total":m} tras cada bloque.
// Variable de entorno MORPHIQ_VERIFICAR_ESTADO=0: `crudo` no revisa antes el estado del spooler.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Ports;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace MorphiqAyudante
{
    internal class Fallo : Exception
    {
        public string Codigo;
        public int Win32;
        public Fallo(string codigo, string mensaje, int win32) : base(mensaje) { Codigo = codigo; Win32 = win32; }
    }

    internal static class Spooler
    {
        const uint ENUM_LOCAL = 2, ENUM_CONEXIONES = 4;
        public const uint ST_PAUSADO = 0x1, ST_ERROR = 0x2, ST_ATASCO = 0x8, ST_SIN_PAPEL = 0x10, ST_PROBLEMA_PAPEL = 0x40,
            ST_FUERA_DE_LINEA = 0x80, ST_TAPA = 0x400000;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct PRINTER_INFO_2
        {
            public string pServerName, pPrinterName, pShareName, pPortName, pDriverName, pComment, pLocation;
            public IntPtr pDevMode;
            public string pSepFile, pPrintProcessor, pDatatype, pParameters;
            public IntPtr pSecurityDescriptor;
            public uint Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, cJobs, AveragePPM;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDatatype; }

        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool EnumPrinters(uint flags, string name, uint level, IntPtr buf, uint size, out uint needed, out uint returned);
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool GetDefaultPrinter(StringBuilder nombre, ref int tam);
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr valores);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool ClosePrinter(IntPtr h);
        public static void Cerrar(IntPtr h) { ClosePrinter(h); }
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern int StartDocPrinter(IntPtr h, int nivel, ref DOC_INFO_1 doc);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool EndDocPrinter(IntPtr h);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool StartPagePrinter(IntPtr h);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool EndPagePrinter(IntPtr h);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool WritePrinter(IntPtr h, byte[] datos, int cuantos, out int escritos);
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool GetPrinter(IntPtr h, uint nivel, IntPtr buf, uint tam, out uint necesarios);

        public static Fallo Traducir(int win32)
        {
            switch (win32)
            {
                case 1801: case 1796: return new Fallo("DESCONECTADA", "No se encontró la impresora", win32);
                case 5: return new Fallo("SIN_PERMISO", "Windows no dejó usar la impresora", win32);
                case 28: return new Fallo("SIN_PAPEL", "Sin papel", win32);
                case 21: case 31: case 55: case 121: case 1117: case 1167:
                    return new Fallo("DESCONECTADA", "Impresora desconectada", win32);
                default: return new Fallo("DESCONOCIDO", "Error de Windows " + win32 + " al imprimir", win32);
            }
        }

        public static string PorOmision()
        {
            int tam = 260;
            StringBuilder nombre = new StringBuilder(tam);
            return GetDefaultPrinter(nombre, ref tam) ? nombre.ToString() : "";
        }

        public static List<PRINTER_INFO_2> Listar()
        {
            uint necesarios, devueltos;
            EnumPrinters(ENUM_LOCAL | ENUM_CONEXIONES, null, 2, IntPtr.Zero, 0, out necesarios, out devueltos);
            List<PRINTER_INFO_2> lista = new List<PRINTER_INFO_2>();
            if (necesarios == 0) return lista;
            IntPtr buf = Marshal.AllocHGlobal((int)necesarios);
            try
            {
                if (!EnumPrinters(ENUM_LOCAL | ENUM_CONEXIONES, null, 2, buf, necesarios, out necesarios, out devueltos))
                    throw Traducir(Marshal.GetLastWin32Error());
                int tam = Marshal.SizeOf(typeof(PRINTER_INFO_2));
                for (int i = 0; i < devueltos; i++)
                    lista.Add((PRINTER_INFO_2)Marshal.PtrToStructure(new IntPtr(buf.ToInt64() + (long)i * tam), typeof(PRINTER_INFO_2)));
            }
            finally { Marshal.FreeHGlobal(buf); }
            return lista;
        }

        public static IntPtr Abrir(string nombre)
        {
            IntPtr h;
            if (!OpenPrinter(nombre, out h, IntPtr.Zero)) throw Traducir(Marshal.GetLastWin32Error());
            return h;
        }

        public static uint Estado(IntPtr h)
        {
            uint necesarios;
            GetPrinter(h, 2, IntPtr.Zero, 0, out necesarios);
            if (necesarios == 0) throw Traducir(Marshal.GetLastWin32Error());
            IntPtr buf = Marshal.AllocHGlobal((int)necesarios);
            try
            {
                if (!GetPrinter(h, 2, buf, necesarios, out necesarios)) throw Traducir(Marshal.GetLastWin32Error());
                return ((PRINTER_INFO_2)Marshal.PtrToStructure(buf, typeof(PRINTER_INFO_2))).Status;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }

        public static void RevisarAntesDeImprimir(uint estado)
        {
            if ((estado & ST_SIN_PAPEL) != 0 || (estado & ST_PROBLEMA_PAPEL) != 0 || (estado & ST_ATASCO) != 0) throw new Fallo("SIN_PAPEL", "Sin papel", 0);
            if ((estado & ST_TAPA) != 0) throw new Fallo("TAPA_ABIERTA", "Tapa abierta", 0);
            if ((estado & ST_FUERA_DE_LINEA) != 0) throw new Fallo("DESCONECTADA", "Impresora desconectada", 0);
        }

        public static void Enviar(string impresora, byte[] datos, int bloque, int pausaMs)
        {
            IntPtr h = Abrir(impresora);
            bool documento = false;
            try
            {
                if (Environment.GetEnvironmentVariable("MORPHIQ_VERIFICAR_ESTADO") != "0") RevisarAntesDeImprimir(Estado(h));
                DOC_INFO_1 doc = new DOC_INFO_1();
                doc.pDocName = "Morphiq POS";
                doc.pOutputFile = null;
                doc.pDatatype = "RAW";
                if (StartDocPrinter(h, 1, ref doc) == 0) throw Traducir(Marshal.GetLastWin32Error());
                documento = true;
                if (!StartPagePrinter(h)) throw Traducir(Marshal.GetLastWin32Error());
                for (int desde = 0; desde < datos.Length; desde += bloque)
                {
                    int cuantos = Math.Min(bloque, datos.Length - desde), escritos;
                    byte[] trozo = new byte[cuantos];
                    Array.Copy(datos, desde, trozo, 0, cuantos);
                    if (!WritePrinter(h, trozo, cuantos, out escritos) || escritos != cuantos) throw Traducir(Marshal.GetLastWin32Error());
                    Programa.Linea("{\"enviados\":" + (desde + cuantos) + ",\"total\":" + datos.Length + "}");
                    if (pausaMs > 0 && desde + cuantos < datos.Length) Thread.Sleep(pausaMs);
                }
                EndPagePrinter(h);
            }
            finally
            {
                if (documento) EndDocPrinter(h);
                ClosePrinter(h);
            }
        }
    }

    public static class Programa
    {
        const int BLOQUE = 4096;
        static readonly object Cerrojo = new object();

        public static void Linea(string json) { lock (Cerrojo) { Console.Out.WriteLine(json); Console.Out.Flush(); } }

        static string Texto(string s)
        {
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 32 || c > 126) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        static string Booleano(bool b) { return b ? "true" : "false"; }

        static string Banderas(uint e)
        {
            return "\"estado\":" + e + ",\"sinPapel\":" + Booleano((e & (Spooler.ST_SIN_PAPEL | Spooler.ST_PROBLEMA_PAPEL | Spooler.ST_ATASCO)) != 0)
                + ",\"fueraDeLinea\":" + Booleano((e & Spooler.ST_FUERA_DE_LINEA) != 0)
                + ",\"tapaAbierta\":" + Booleano((e & Spooler.ST_TAPA) != 0);
        }

        static string Listar()
        {
            string omision = Spooler.PorOmision();
            List<string> filas = new List<string>();
            foreach (Spooler.PRINTER_INFO_2 p in Spooler.Listar())
                filas.Add("{\"nombre\":" + Texto(p.pPrinterName) + ",\"puerto\":" + Texto(p.pPortName) + ",\"driver\":" + Texto(p.pDriverName)
                    + ",\"predeterminada\":" + Booleano(p.pPrinterName == omision) + "," + Banderas(p.Status) + "}");
            return "{\"ok\":true,\"impresoras\":[" + string.Join(",", filas.ToArray()) + "]}";
        }

        static string Estado(string impresora)
        {
            IntPtr h = Spooler.Abrir(impresora);
            try { return "{\"ok\":true," + Banderas(Spooler.Estado(h)) + "}"; }
            finally { Spooler.Cerrar(h); }
        }

        static void EnviarPorSerie(string puerto, int baudios, byte[] datos, int bloque, int pausaMs)
        {
            try
            {
                using (SerialPort sp = new SerialPort(puerto, baudios, Parity.None, 8, StopBits.One))
                {
                    sp.WriteTimeout = 5000;
                    sp.Open();
                    for (int desde = 0; desde < datos.Length; desde += bloque)
                    {
                        int cuantos = Math.Min(bloque, datos.Length - desde);
                        sp.Write(datos, desde, cuantos);
                        Linea("{\"enviados\":" + (desde + cuantos) + ",\"total\":" + datos.Length + "}");
                        if (pausaMs > 0 && desde + cuantos < datos.Length) Thread.Sleep(pausaMs);
                    }
                    sp.BaseStream.Flush();
                }
            }
            catch (UnauthorizedAccessException) { throw new Fallo("SIN_PERMISO", "El puerto " + puerto + " está ocupado o sin permiso", 5); }
            catch (FileNotFoundException) { throw new Fallo("DESCONECTADA", "No existe el puerto " + puerto, 2); }
            catch (TimeoutException) { throw new Fallo("TIEMPO", "El puerto " + puerto + " no respondió", 0); }
            catch (IOException e) { throw new Fallo("DESCONECTADA", "Falló el puerto " + puerto + ": " + e.Message, 0); }
        }

        static int Entero(string[] a, int i, int porOmision, int minimo)
        {
            int v;
            return a.Length > i && int.TryParse(a[i], out v) && v >= minimo ? v : porOmision;
        }

        static string Despachar(string[] a)
        {
            if (a.Length == 0) throw new Fallo("DESCONOCIDO", "Falta el subcomando", 0);
            switch (a[0])
            {
                case "listar": return Listar();
                case "estado":
                    if (a.Length < 2) throw new Fallo("DESCONOCIDO", "Falta la impresora", 0);
                    return Estado(a[1]);
                case "crudo":
                    if (a.Length < 3) throw new Fallo("DESCONOCIDO", "Faltan impresora y archivo", 0);
                    byte[] datos = File.ReadAllBytes(a[2]);
                    Spooler.Enviar(a[1], datos, Entero(a, 3, BLOQUE, 1), Entero(a, 4, 0, 0));
                    return "{\"ok\":true,\"bytes\":" + datos.Length + "}";
                case "serie":
                    if (a.Length < 4) throw new Fallo("DESCONOCIDO", "Faltan puerto, baudios y archivo", 0);
                    byte[] bytes = File.ReadAllBytes(a[3]);
                    EnviarPorSerie(a[1], Entero(a, 2, 9600, 300), bytes, Entero(a, 4, BLOQUE, 1), Entero(a, 5, 0, 0));
                    return "{\"ok\":true,\"bytes\":" + bytes.Length + "}";
                default: throw new Fallo("DESCONOCIDO", "Subcomando desconocido: " + a[0], 0);
            }
        }

        public static int Ejecutar(string[] args)
        {
            try { Linea(Despachar(args)); return 0; }
            catch (Fallo f) { Linea("{\"ok\":false,\"codigo\":\"" + f.Codigo + "\",\"mensaje\":" + Texto(f.Message) + ",\"win32\":" + f.Win32 + "}"); }
            catch (Win32Exception e) { Fallo f = Spooler.Traducir(e.NativeErrorCode); Linea("{\"ok\":false,\"codigo\":\"" + f.Codigo + "\",\"mensaje\":" + Texto(f.Message) + "}"); }
            catch (Exception e) { Linea("{\"ok\":false,\"codigo\":\"DESCONOCIDO\",\"mensaje\":" + Texto(e.Message) + "}"); }
            return 1;
        }

        public static int Main(string[] args) { return Ejecutar(args); }
    }
}

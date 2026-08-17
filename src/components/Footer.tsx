export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-soft/50 px-6 py-10 text-white/60">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <img src="/logo_mrcom.png" alt="MR.COM Soluciones" className="h-9 w-9 rounded-lg bg-white/90 p-1" />
              <span className="font-semibold text-white">SmartPOS</span>
            </div>
            <p className="mt-3 text-sm">
              Punto de venta profesional en la nube, por MR.COM Soluciones.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-white">Producto</p>
            <ul className="space-y-2 text-sm">
              <li><a className="hover:text-white" href="/login">Caja</a></li>
              <li><a className="hover:text-white" href="/login">Productos</a></li>
              <li><a className="hover:text-white" href="/login">Reportes</a></li>
              <li><a className="hover:text-white" href="/login">Planes</a></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-white">MR.COM</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="hover:text-white" href="https://shop.mrcomsoluciones.cl" target="_blank" rel="noreferrer">
                  Tienda
                </a>
              </li>
              <li>
                <a className="hover:text-white" href="mailto:soporte@mrcomsoluciones.cl">
                  Soporte
                </a>
              </li>
              <li>
                <a className="hover:text-white" href="mailto:contacto@mrcomsoluciones.cl">
                  Contacto
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-white">Legal</p>
            <ul className="space-y-2 text-sm">
              <li><a className="hover:text-white" href="#">Privacidad</a></li>
              <li><a className="hover:text-white" href="#">Términos</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs">
          © {new Date().getFullYear()} MR.COM Soluciones · SmartPOS. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}

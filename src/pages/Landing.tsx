import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import Footer from "../components/Footer";

export default function Landing() {
  const { user } = useAuth();
  const FEATURES = [
    { icon: "point_of_sale", title: "Caja", desc: "Registra ventas al instante, edita productos y cantidades desde el celular o la caja." },
    { icon: "inventory_2", title: "Productos", desc: "Catálogo con precios y categorías. Agrega y elimina en segundos." },
    { icon: "groups", title: "Clientes", desc: "Guarda tu cartera de clientes y consulta su historial de compras." },
    { icon: "insights", title: "Reportes", desc: "Ventas del día y del mes, productos más vendidos, exporta todo a CSV." },
    { icon: "receipt_long", title: "Boletas a tu medida", desc: "Personaliza logo, colores y texto de agradecimiento de cada boleta." },
    { icon: "devices", title: "Multi-dispositivo", desc: "Mismo sistema en móvil, tablet y escritorio, en la nube." },
  ];

  const STEPS = [
    { n: "1", title: "Activa tu cuenta", desc: "Te entregamos el acceso al confirmar tu plan." },
    { n: "2", title: "Configura tu negocio", desc: "Ponle nombre, RUT y elige tu plan (básico, pro o empresa)." },
    { n: "3", title: "¡Empieza a vender!", desc: "Accede desde cualquier dispositivo y emite tus boletas." },
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-sky-900 via-cyan-900 to-teal-800 text-white">
      {/* HERO */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1507525423211-b72b2aacc7b0?auto=format&fit=crop&w=1740&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster="https://images.unsplash.com/photo-1507525423211-b72b2aacc7b0?auto=format&fit=crop&w=1740&q=80"
          onError={(e) => {
            (e.currentTarget as HTMLVideoElement).style.display = "none";
          }}
        >
          <source src="/hero-beach.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/45" />
        <div className="relative z-10 flex flex-1 flex-col">
          <header className="flex items-center justify-between p-5 md:p-8">
            <div className="flex items-center gap-3">
              <img src="/logo_mrcom.png" alt="MR.COM Soluciones" className="h-10 w-10 rounded-xl bg-white/90 p-1" />
              <span className="text-lg font-semibold text-white">SmartPOS</span>
            </div>
            <Link
              to={user ? "/" : "/login"}
              className="btn-ghost border-white/30 text-white hover:bg-white/10"
            >
              {user ? "Ir al panel" : "Iniciar sesión"}
            </Link>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-white/70">MR.COM Soluciones</p>
            <h1 className="mt-3 text-6xl font-bold text-white drop-shadow-lg md:text-7xl">Hola</h1>
            <p className="mt-4 max-w-md text-lg text-white/85 drop-shadow">
              Tu punto de venta profesional en la nube. Vende desde cualquier dispositivo,
              con boletas a tu medida.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/login" className="btn-primary px-7 py-3 text-base">
                Iniciar sesión
              </Link>
              <a
                href="mailto:soporte@mrcomsoluciones.cl?subject=Solicitar%20acceso%20SmartPOS"
                className="btn-ghost border-white/30 px-7 py-3 text-base text-white hover:bg-white/10"
              >
                Solicitar acceso
              </a>
            </div>
          </main>
        </div>
      </section>

      {/* QUÉ PUEDES HACER */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">¿Qué puedes hacer con SmartPOS?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-white/70">
            Todo lo que tu negocio necesita para vender, en un solo lugar y desde cualquier dispositivo.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <span className="material-symbols-rounded text-3xl text-accent">{f.icon}</span>
                <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-sm text-white/60">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="bg-white/5 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold">¿Cómo funciona?</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-ink-soft/50 p-5">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-moon-600 text-lg font-bold">
                  {s.n}
                </div>
                <h3 className="font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-white/60">{s.desc}</p>
              </div>
            ))}
          </div>
          <Link to="/login" className="btn-primary mt-10 px-7 py-3 text-base">
            Empezar ahora
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

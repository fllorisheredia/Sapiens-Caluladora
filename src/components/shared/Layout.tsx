import React from "react";
import { Toaster } from "sileo";
import Button from "../ui/Button";
import sapiensLogo from "../../assets/sapiens-logo.png";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-brand-navy font-sans selection:bg-brand-mint/20">
      <header className="sticky top-0 z-50 w-full border-b border-brand-navy/5 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-40 h-14 rounded-2xl overflow-hidden flex items-center justify-center bg-transparent  px-3 group-hover:scale-105 transition-transform duration-300">
              <img
                src={sapiensLogo}
                alt="Sapiens Energia"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-col"></div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">{children}</main>

      {/* <footer className="hidden md:block border-t border-brand-navy/5 py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-white">
                  <img
                    src={sapiensLogo}
                    alt="Sapiens Energia"
                    className="w-20 h-6 object-contain"
                  />
                </div>
              </div>

              <p className="text-brand-gray text-sm max-w-sm leading-relaxed">
                Transformamos la manera en que consumes energía. Estudios personalizados con IA para un futuro más sostenible y económico.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-brand-navy/40">
                Producto
              </h4>
              <ul className="space-y-4 text-sm font-medium text-brand-gray">
                <li><a href="#" className="hover:text-brand-navy transition-colors">Estudios</a></li>
                <li><a href="#" className="hover:text-brand-navy transition-colors">Precios</a></li>
                <li><a href="#" className="hover:text-brand-navy transition-colors">API</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-6 text-brand-navy/40">
                Legal
              </h4>
              <ul className="space-y-4 text-sm font-medium text-brand-gray">
                <li><a href="#" className="hover:text-brand-navy transition-colors">Privacidad</a></li>
                <li><a href="#" className="hover:text-brand-navy transition-colors">Términos</a></li>
                <li><a href="#" className="hover:text-brand-navy transition-colors">Cookies</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-brand-navy/5 text-center text-brand-gray/60 text-xs font-medium">
            <p>© 2026 SolarStudy Pro. Todos los derechos reservados. Hecho con pasión por la energía limpia.</p>
          </div>
        </div>
      </footer> */}

      <Toaster position="top-center" theme="light" />
    </div>
  );
}

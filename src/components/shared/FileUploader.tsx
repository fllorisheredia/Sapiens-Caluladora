import React, { useState, useCallback } from "react";
import { Upload, FileText, X, ShieldCheck, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { sileo } from "sileo";
import { cn } from "../../lib/utils";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  accept?: string[];
  maxSize?: number; // in MB
  disabled?: boolean;
  disabledMessage?: string;
}

export default function FileUploader({
  onFileSelect,
  accept = [".pdf", ".jpg", ".jpeg", ".png"],
  maxSize = 10,
  disabled = false,
  disabledMessage = "Debes aceptar la política de privacidad antes de subir la factura.",
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const showDisabledToast = useCallback(() => {
    sileo.action({
      title: "Debes aceptar la política de privacidad",
      description:
        "Para subir la factura, primero tienes que aceptar el tratamiento de datos.",
      button: {
        title: "Ver política",
        onClick: () => window.open("/politica-privacidad.html", "_blank"),
      },
    });
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) {
        setIsDragging(false);
        return;
      }
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File) => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

    if (!accept.includes(extension)) {
      sileo.error({
        title: "Tipo de archivo no permitido",
        description: `Solo se aceptan: ${accept.join(", ")}`,
      });
      return false;
    }

    if (file.size > maxSize * 1024 * 1024) {
      sileo.error({
        title: "Archivo demasiado grande",
        description: `El límite es de ${maxSize}MB`,
      });
      return false;
    }

    return true;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) {
        showDisabledToast();
        return;
      }

      const droppedFile = e.dataTransfer.files[0];

      if (droppedFile && validateFile(droppedFile)) {
        setFile(droppedFile);
        onFileSelect(droppedFile);
      }
    },
    [disabled, onFileSelect, showDisabledToast],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      showDisabledToast();
      e.target.value = "";
      return;
    }

    const selectedFile = e.target.files?.[0];

    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      onFileSelect(selectedFile);
    }

    e.target.value = "";
  };

  const handleDisabledClick = () => {
    if (disabled) {
      showDisabledToast();
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDisabledClick}
            className={cn(
              "relative rounded-3xl border-2 border-dashed transition-all duration-500 ease-out p-16 flex flex-col items-center justify-center gap-6 overflow-hidden",
              disabled
                ? "border-brand-navy/10 bg-brand-navy/[0.02] cursor-not-allowed opacity-70"
                : isDragging
                  ? "group cursor-pointer border-brand-mint bg-brand-mint/5 scale-[1.02] shadow-2xl shadow-brand-mint/10"
                  : "group cursor-pointer border-brand-navy/10 hover:border-brand-sky hover:bg-brand-sky/5 bg-white shadow-sm",
            )}
          >
            {!disabled && (
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                onChange={handleFileInput}
                accept={accept.join(",")}
              />
            )}

            <div
              className={cn(
                "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg",
                disabled
                  ? "bg-brand-navy/5 text-brand-navy/30"
                  : isDragging
                    ? "brand-gradient text-brand-navy scale-110 rotate-6"
                    : "bg-brand-navy/5 text-brand-navy/40 group-hover:scale-110 group-hover:rotate-3",
              )}
            >
              {disabled ? (
                <Lock className="w-10 h-10" />
              ) : (
                <Upload className="w-10 h-10" />
              )}
            </div>

            <div className="text-center max-w-sm">
              <h3 className="text-2xl font-bold text-brand-navy leading-tight">
                {disabled
                  ? "Acepta la política antes de subir"
                  : isDragging
                    ? "¡Suéltalo aquí!"
                    : "Sube tu factura eléctrica"}
              </h3>

              <p className="text-brand-gray text-sm mt-3 font-medium leading-relaxed">
                {disabled
                  ? disabledMessage
                  : "Arrastra tu archivo PDF o imagen aquí para que nuestra IA analice tu consumo automáticamente."}
              </p>
            </div>

            <div className="flex gap-2 mt-2 flex-wrap justify-center">
              {accept.map((ext) => (
                <span
                  key={ext}
                  className="px-3 py-1 bg-brand-navy/5 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-navy/40 border border-brand-navy/5"
                >
                  {ext.replace(".", "")}
                </span>
              ))}
            </div>

            <div className="mt-8 pt-8 border-t border-brand-navy/5 w-full flex items-center justify-center gap-2 text-brand-navy/30">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Tus datos están seguros y encriptados
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-brand-navy/10 bg-white p-8 flex items-center gap-6 shadow-xl shadow-brand-navy/5"
          >
            <div className="w-16 h-16 brand-gradient text-brand-navy rounded-2xl flex items-center justify-center shadow-lg shadow-brand-mint/20">
              <FileText className="w-8 h-8" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-brand-navy truncate">
                {file.name}
              </p>
              <p className="text-sm font-semibold text-brand-gray">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <button
              onClick={removeFile}
              className="w-10 h-10 rounded-xl hover:bg-red-50 flex items-center justify-center text-brand-navy/20 hover:text-red-500 transition-all duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

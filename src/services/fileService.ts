// src/services/fileService.ts
import fs from "fs";
import path from "path";

// Función para guardar el archivo PDF en el servidor
export function savePdfInAssets(pdfBlob: Blob, fileName: string): Promise<string> {
  const filePath = path.join(__dirname, "../assets", fileName);  // Ruta donde se guardará el archivo

  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(pdfBlob as any); // Convertimos el Blob a Buffer
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        reject(new Error("Error al guardar el archivo PDF"));
      } else {
        resolve(filePath);  // Retornamos la ruta del archivo guardado
      }
    });
  });
}
import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface InstallationMapProps {
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
}

export default function InstallationMap({
  lat,
  lng,
  title,
  subtitle,
}: InstallationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      console.error("Falta VITE_MAPBOX_TOKEN");
      return;
    }

    mapboxgl.accessToken = token;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [lng, lat],
      zoom: 12,
    });

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
      `
        <div style="font-family: sans-serif;">
          <strong>${title}</strong>
          ${subtitle ? `<div style="margin-top:4px;font-size:12px;">${subtitle}</div>` : ""}
        </div>
      `,
    );

    new mapboxgl.Marker()
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, title, subtitle]);

  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-brand-navy/10 bg-brand-navy/[0.02]">
      <div
        ref={mapContainerRef}
        className="h-[250px] md:h-[280px] w-full"
      />{" "}
    </div>
  );
}

import { ImageResponse } from "next/og";

/** Ícono de la app: "P" sobre fondo azul noche. `maskable` deja margen seguro para Android. */
export function appIcon(size: number, maskable = false) {
  const inner = maskable ? size * 0.6 : size * 0.78;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1b2d",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: inner * 0.28,
            background: "#2bb5a4",
            color: "#0f1b2d",
            fontSize: inner * 0.66,
            fontWeight: 800,
          }}
        >
          P
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}

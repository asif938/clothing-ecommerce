import { ImageResponse } from "next/og";
import { getBrandIdentity } from "../../lib/brand";

export async function GET() {
  const { name, color } = await getBrandIdentity();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: color, color: "#fff", fontSize: 256, fontWeight: 700 }}>
        {name.charAt(0).toUpperCase()}
      </div>
    ),
    { width: 512, height: 512 },
  );
}

import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db.js";

export const systemDefaults = {
  displayName: "BCIS",
  supportContact: "",
  businessName: "Bukidnon Cable and Internet Services",
  address: "",
  contactNumber: "",
  email: "",
  tin: "",
};
export type SystemProfile = typeof systemDefaults & { themeColor?: string };

export const profileFields = {
  businessName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300),
  contactNumber: z.string().trim().max(100),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      message: "Enter a valid email address",
    }),
  tin: z
    .string()
    .trim()
    .regex(/^(\d{3}-\d{3}-\d{3}(-\d{3,5})?)?$/, {
      message: "Use the format 000-000-000 or 000-000-000-000",
    }),
};

/** Validates a PNG/JPEG data URL by its magic bytes and returns the decoded image. */
export function imageBytes(image: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    image,
  );
  if (!match) throw new Error("Upload a PNG or JPEG image.");
  const bytes = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid || bytes.length > 350000)
    throw new Error("Invalid image or image exceeds 350 KB.");
  return bytes;
}

export async function systemProfile(): Promise<SystemProfile> {
  const value = (
    await pool.query(
      "SELECT value FROM application_settings WHERE key='system'",
    )
  ).rows[0]?.value;
  return { ...systemDefaults, ...value };
}

export async function systemLogo(): Promise<string | null> {
  return (
    (
      await pool.query(
        "SELECT value->>'image' AS image FROM application_settings WHERE key='system_logo'",
      )
    ).rows[0]?.image ?? null
  );
}

export async function systemLogoVersion(): Promise<string | null> {
  return (
    (
      await pool.query(
        "SELECT value->>'version' AS version FROM application_settings WHERE key='system_logo'",
      )
    ).rows[0]?.version ?? null
  );
}

export const logoVersion = (logo: string) =>
  createHash("sha256").update(logo).digest("hex").slice(0, 16);

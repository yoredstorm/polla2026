import { z } from "zod";

export const passwordField = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
  .regex(/[0-9]/, "Debe tener al menos un número");

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Contraseña actual requerida"),
    new_password: passwordField,
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

export const forcedChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Contraseña temporal requerida"),
    new_password: passwordField,
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

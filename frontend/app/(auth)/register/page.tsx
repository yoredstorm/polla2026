"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y _"),
  password: z.string().min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
    .regex(/[0-9]/, "Debe tener al menos un número"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerMutation } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  });

  function onSubmit(values: RegisterValues) {
    registerMutation.mutate({ username: values.username, password: values.password });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-accent mb-2">POLLA DEPORTIVA</h1>
          <p className="text-muted">Crea tu cuenta con usuario y contraseña</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-5">
          {[
            { name: "username" as const, label: "Usuario", type: "text", placeholder: "mi usuario" },
            { name: "password" as const, label: "Contraseña", type: "password", placeholder: "Mínimo 8 caracteres" },
            { name: "confirmPassword" as const, label: "Confirmar Contraseña", type: "password", placeholder: "Repite tu contraseña" },
          ].map((field) => (
            <div key={field.name}>
              <label className="text-sm text-muted mb-1 block">{field.label}</label>
              <input
                {...register(field.name)}
                type={field.type}
                placeholder={field.placeholder}
                autoComplete={field.name === "username" ? "username" : "new-password"}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
              />
              {errors[field.name] && <p className="text-danger text-xs mt-1">{errors[field.name]?.message}</p>}
            </div>
          ))}
          {registerMutation.isError && (
            <p className="text-danger text-sm text-center">
              {(registerMutation.error as any)?.error?.message || "Error al registrarse"}
            </p>
          )}
          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full py-3 rounded-xl bg-accent text-background font-bold hover:bg-accent-dim transition-colors disabled:opacity-50"
          >
            {registerMutation.isPending ? "Registrando..." : "Crear Cuenta"}
          </button>
          <p className="text-center text-muted text-sm">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-accent hover:underline">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

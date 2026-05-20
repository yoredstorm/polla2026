"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { requestPasswordReset } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { AuthErrorAlert } from "@/components/ui/AuthErrorAlert";

const schema = z.object({
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y _"),
  message: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      requestPasswordReset(values.username, values.message?.trim() || undefined),
    onSuccess: () => setSubmitted(true),
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative bg-ambient-mesh"
      style={{ backgroundImage: "url('/image/background.png')" }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-accent mb-2">Recuperar contraseña</h1>
          <p className="text-muted text-sm">
            El administrador recibirá tu solicitud y te entregará una contraseña temporal.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-4 text-center">
            <p className="text-white text-sm">
              Si el usuario existe, el administrador recibirá la solicitud. Contacta al administrador
              para obtener tu contraseña temporal.
            </p>
            <Link href="/login" className="text-accent hover:underline text-sm">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit((v) => mutation.mutate(v))}
            className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-5"
          >
            <div>
              <label className="text-sm text-muted mb-1 block">Usuario</label>
              <input
                {...register("username")}
                type="text"
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
                placeholder="tu usuario"
              />
              {errors.username && (
                <p className="text-danger text-xs mt-1">{errors.username.message}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Mensaje (opcional)</label>
              <textarea
                {...register("message")}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent resize-none"
                placeholder="Ej. no recuerdo mi contraseña"
              />
            </div>
            {mutation.isError && <AuthErrorAlert error={mutation.error} />}
            <Button type="submit" size="lg" loading={mutation.isPending}>
              Enviar solicitud
            </Button>
            <p className="text-center text-muted text-sm">
              <Link href="/login" className="text-accent hover:underline">
                ← Volver al inicio de sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const loginSchema = z.object({
  username: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y _"),
  password: z.string().min(1, "Contraseña requerida"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const inactivityLogout = searchParams.get("reason") === "inactivity";
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(values: LoginValues) {
    login.mutate({ username: values.username, password: values.password });
  }

  return (
    <>
      {inactivityLogout && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 mb-4 text-sm text-yellow-200 text-center">
          Tu sesion fue cerrada por inactividad. Inicia sesion nuevamente.
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-5">
        <div>
          <label className="text-sm text-muted mb-1 block">Usuario</label>
          <input
            {...register("username")}
            type="text"
            autoComplete="username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
            placeholder="tu_usuario"
          />
          {errors.username && <p className="text-danger text-xs mt-1">{errors.username.message}</p>}
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">Contraseña</label>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
            placeholder="••••••••"
          />
          {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
        </div>
        {login.isError && (
          <p className="text-danger text-sm text-center">
            {(login.error as any)?.error?.message || "Error al iniciar sesión"}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full py-3 rounded-xl bg-accent text-background font-bold hover:bg-accent-dim transition-colors disabled:opacity-50"
        >
          {login.isPending ? "Iniciando..." : "Iniciar Sesión"}
        </button>
        <p className="text-center text-muted text-sm">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-accent hover:underline">Regístrate</Link>
        </p>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-accent mb-2">POLLA DEPORTIVA</h1>
          <p className="text-muted">Inicia sesión con tu usuario</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

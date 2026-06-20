"use client";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { AuthErrorAlert } from "@/components/ui/AuthErrorAlert";
import { AuthFormStagger, AuthPageEnter } from "@/components/ui/AuthPageEnter";

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
  const callbackUrl = searchParams.get("callbackUrl");
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(values: LoginValues) {
    login.mutate({
      username: values.username,
      password: values.password,
      redirectTo: callbackUrl ?? undefined,
    });
  }

  return (
    <>
      {inactivityLogout && (
        <AuthFormStagger index={0}>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 mb-4 text-sm text-yellow-200 text-center">
            Tu sesion fue cerrada por inactividad. Inicia sesion nuevamente.
          </div>
        </AuthFormStagger>
      )}
      <AuthFormStagger index={inactivityLogout ? 1 : 0}>
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-5">
          <AuthFormStagger index={0}>
            <div>
              <label className="text-sm text-muted mb-1 block">Usuario</label>
              <input
                {...register("username")}
                type="text"
                autoComplete="username"
                className="auth-input"
                placeholder="tu usuario"
              />
              {errors.username && <p className="text-danger text-xs mt-1">{errors.username.message}</p>}
            </div>
          </AuthFormStagger>
          <AuthFormStagger index={1}>
            <div>
              <label className="text-sm text-muted mb-1 block">Contraseña</label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                className="auth-input"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
            </div>
          </AuthFormStagger>
          {login.isError && (
            <AuthFormStagger index={2}>
              <AuthErrorAlert error={login.error} />
            </AuthFormStagger>
          )}
          <AuthFormStagger index={3}>
            <Button type="submit" size="lg" loading={login.isPending}>
              Iniciar Sesión
            </Button>
          </AuthFormStagger>
          <AuthFormStagger index={4}>
            <p className="text-center text-muted text-sm">
              <Link href="/forgot-password" className="text-accent nav-link hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          </AuthFormStagger>
          <AuthFormStagger index={5}>
            <p className="text-center text-muted text-sm">
              ¿No tienes cuenta?{" "}
              <Link href="/register" className="text-accent nav-link hover:underline">Regístrate</Link>
            </p>
          </AuthFormStagger>
        </form>
      </AuthFormStagger>
    </>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative bg-ambient-mesh"
      style={{ backgroundImage: "url('/image/background.png')" }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <AuthPageEnter className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-accent mb-2">POLLA DEPORTIVA</h1>
          <p className="text-muted">Inicia sesión con tu usuario</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </AuthPageEnter>
    </div>
  );
}

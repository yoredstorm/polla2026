"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/auth";
import { forcedChangePasswordSchema } from "@/lib/passwordSchema";
import { z } from "zod";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { AuthErrorAlert } from "@/components/ui/AuthErrorAlert";
import { useAuthStore } from "@/store/authStore";

type FormValues = z.infer<typeof forcedChangePasswordSchema>;

export default function ChangePasswordRequiredPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(forcedChangePasswordSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      changePassword(values.current_password, values.new_password),
    onSuccess: (data) => {
      if (data?.user) setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/dashboard");
    },
  });

  return (
    <PageShell maxWidth="sm" withMobileNav={false}>
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl text-white mb-2">Nueva contraseña obligatoria</h1>
          <p className="text-muted text-sm">
            Ingresaste con una contraseña temporal. Elige una contraseña nueva para continuar.
          </p>
        </div>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-8 space-y-5"
        >
          <div>
            <label className="text-sm text-muted mb-1 block">Contraseña temporal</label>
            <input
              {...register("current_password")}
              type="password"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
            {errors.current_password && (
              <p className="text-danger text-xs mt-1">{errors.current_password.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Nueva contraseña</label>
            <input
              {...register("new_password")}
              type="password"
              autoComplete="new-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
            {errors.new_password && (
              <p className="text-danger text-xs mt-1">{errors.new_password.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Confirmar nueva contraseña</label>
            <input
              {...register("confirm_password")}
              type="password"
              autoComplete="new-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
            />
            {errors.confirm_password && (
              <p className="text-danger text-xs mt-1">{errors.confirm_password.message}</p>
            )}
          </div>
          {mutation.isError && <AuthErrorAlert error={mutation.error} />}
          <Button type="submit" size="lg" loading={mutation.isPending} className="w-full">
            Guardar y continuar
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

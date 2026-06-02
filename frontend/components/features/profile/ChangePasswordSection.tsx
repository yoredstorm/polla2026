"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { changePassword } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/passwordSchema";
import { Button } from "@/components/ui/Button";
import { AuthErrorAlert } from "@/components/ui/AuthErrorAlert";
import { useToast } from "@/components/ui/Toast";

type FormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordSection() {
  const toast = useToast((s) => s.add);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      changePassword(values.current_password, values.new_password),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast("Contraseña actualizada correctamente", "success");
    },
  });

  return (
    <div className="pt-6 border-t border-white/10 space-y-4">
      <h2 className="font-display text-lg text-white">Cambiar contraseña</h2>
      <p className="text-xs text-muted">
        Mínimo 8 caracteres, una mayúscula y un número.
      </p>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4 max-w-md">
        <div>
          <label className="text-sm text-muted mb-1 block">Contraseña actual</label>
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
        <Button type="submit" loading={mutation.isPending}>
          Actualizar contraseña
        </Button>
      </form>
    </div>
  );
}

import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { ErroNegocio } from './erros';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(v: unknown) {
    const r = this.schema.safeParse(v ?? {});
    if (r.success) return r.data;
    const i = r.error.issues[0]!;
    throw new ErroNegocio(400, i.message, i.path.join('.') || undefined);
  }
}

import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { ErroNegocio } from './erros';

const ehPng = (b: Buffer) => b.length > 8 && b.subarray(1, 4).toString() === 'PNG';
const ehJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const decodificar = (base64: string) => Buffer.from(base64.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');

// Assinaturas e fotos viram arquivos numa pasta (volume do Docker); o banco guarda só o id (caminho relativo).
@Injectable()
export class ArquivosService {
  private readonly raiz: string;

  constructor(dir: string = process.env.ARQUIVOS_DIR ?? './arquivos') {
    this.raiz = resolve(dir);
  }

  async salvarPng(base64: string, pasta: 'assinaturas'): Promise<string> {
    const buf = decodificar(base64);
    if (!ehPng(buf)) throw new ErroNegocio(400, 'Assinatura inválida.');
    return this.gravar(buf, pasta, 'png');
  }

  async salvarFoto(base64: string): Promise<string> {
    const buf = decodificar(base64);
    if (ehPng(buf)) return this.gravar(buf, 'fotos', 'png');
    if (ehJpeg(buf)) return this.gravar(buf, 'fotos', 'jpg');
    throw new ErroNegocio(400, 'A foto precisa ser uma imagem PNG ou JPEG.');
  }

  caminho(id: string): string {
    const c = resolve(this.raiz, id);
    if (!c.startsWith(this.raiz + sep)) throw new ErroNegocio(400, 'Arquivo inválido.');
    return c;
  }

  private async gravar(buf: Buffer, pasta: string, ext: string) {
    const id = `${pasta}/${randomUUID()}.${ext}`;
    await mkdir(resolve(this.raiz, pasta), { recursive: true });
    await writeFile(this.caminho(id), buf);
    return id;
  }
}

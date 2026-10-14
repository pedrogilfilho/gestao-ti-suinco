import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArquivosService } from './arquivos.service';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG_INICIO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const pasta = () => new ArquivosService(mkdtempSync(join(tmpdir(), 'arq-')));

describe('ArquivosService', () => {
  it('grava o PNG e devolve um id que leva ao arquivo', async () => {
    const s = pasta();
    const id = await s.salvarPng(PNG_1PX, 'assinaturas');
    expect(id).toMatch(/^assinaturas\/[0-9a-f-]{36}\.png$/);
    expect(readFileSync(s.caminho(id)).subarray(1, 4).toString()).toBe('PNG');
  });
  it('recusa o que não é PNG', async () => {
    await expect(pasta().salvarPng('data:image/png;base64,QUJD', 'assinaturas')).rejects.toThrow('Assinatura inválida.');
  });
  it('foto aceita JPEG e grava com a extensão certa', async () => {
    const s = pasta();
    const id = await s.salvarFoto(JPEG_INICIO);
    expect(id).toMatch(/^fotos\/[0-9a-f-]{36}\.jpg$/);
    expect(readFileSync(s.caminho(id))[0]).toBe(0xff);
  });
  it('foto recusa o que não é imagem', async () => {
    await expect(pasta().salvarFoto('data:image/jpeg;base64,QUJD')).rejects.toThrow('A foto precisa ser uma imagem PNG ou JPEG.');
  });
  it('não deixa sair da pasta', () => {
    expect(() => pasta().caminho('../../etc/passwd')).toThrow();
  });
});

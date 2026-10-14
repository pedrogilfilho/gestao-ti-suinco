import { describe, it, expect, vi } from 'vitest';
import { auditar } from './auditar';

describe('auditar', () => {
  it('grava pelo cliente da transação recebido, nunca por fora', async () => {
    const create = vi.fn().mockResolvedValue({});
    await auditar({ auditoria: { create } } as never, { atorId: 'a', acao: 'editar', area: 'setores', itemId: 's', antes: { nome: 'A' }, depois: { nome: 'B' } });
    expect(create).toHaveBeenCalledWith({ data: { atorId: 'a', acao: 'editar', area: 'setores', itemId: 's', antes: { nome: 'A' }, depois: { nome: 'B' } } });
  });
  it('tira campos sensíveis do antes/depois', async () => {
    const create = vi.fn().mockResolvedValue({});
    await auditar({ auditoria: { create } } as never, { atorId: 'a', acao: 'senha', area: 'acessos', itemId: 'x', depois: { senhaHash: 'h', papel: 'tic' } });
    expect(create.mock.calls[0][0].data.depois).toEqual({ papel: 'tic' });
  });
});

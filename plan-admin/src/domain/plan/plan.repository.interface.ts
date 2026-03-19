/**
 * Interface do Repositório de Plan
 *
 * Define o contrato para acesso aos dados de planos.
 */

import type { PlanEntity } from "./plan.entity";

export interface IPlanRepository {
  /**
   * Busca um plano por ID
   */
  findById(id: string): Promise<PlanEntity | null>;

  /**
   * Busca um plano por nome
   */
  findByName(name: string): Promise<PlanEntity | null>;

  /**
   * Busca todos os planos com o mesmo nome (mesmo grupo)
   */
  findAllByName(name: string): Promise<PlanEntity[]>;

  /**
   * Lista todos os planos
   */
  findAll(): Promise<PlanEntity[]>;

  /**
   * Lista apenas planos ativos
   */
  findActive(): Promise<PlanEntity[]>;

  /**
   * Cria um novo plano
   */
  create(data: Omit<PlanEntity, "id" | "createdAt" | "updatedAt">): Promise<PlanEntity>;

  /**
   * Atualiza um plano existente
   */
  update(id: string, data: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt">>): Promise<PlanEntity>;

  /**
   * Remove um plano (soft delete)
   */
  delete(id: string): Promise<void>;

  /**
   * Remove um plano permanentemente do banco de dados (hard delete)
   */
  deletePermanently(id: string): Promise<void>;

  /**
   * Remove todos os planos com o mesmo nome (mesmo grupo)
   */
  deleteAllByName(name: string): Promise<void>;

  /**
   * Remove permanentemente todos os planos com o mesmo nome (mesmo grupo)
   */
  deleteAllByNamePermanently(name: string): Promise<void>;

  findByVariant(name: string, toggleId: string | null, toggleOptionValue: string | null): Promise<PlanEntity | null>;
}

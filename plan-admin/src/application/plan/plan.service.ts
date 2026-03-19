/**
 * Serviço de Plan
 *
 * Responsável pela lógica de negócio relacionada a planos.
 */

import type { PlanEntity } from "@/domain/plan/plan.entity";
import type { IPlanRepository } from "@/domain/plan/plan.repository.interface";
import { logger } from "@/infrastructure/logger/logger";

export class PlanService {
  constructor(private readonly planRepository: IPlanRepository) { }

  /**
   * Lista todos os planos
   */
  async getAllPlans(): Promise<PlanEntity[]> {
    try {
      logger.debug("Listando todos os planos");

      const plans = await this.planRepository.findAll();

      logger.debug("Planos listados com sucesso", { count: plans.length });

      return plans;
    } catch (error) {
      logger.error("Erro ao listar planos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Lista apenas planos ativos
   */
  async getActivePlans(): Promise<PlanEntity[]> {
    try {
      logger.debug("Listando planos ativos");

      const plans = await this.planRepository.findActive();

      logger.debug("Planos ativos listados com sucesso", { count: plans.length });

      return plans;
    } catch (error) {
      logger.error("Erro ao listar planos ativos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Busca um plano por ID
   */
  async getPlanById(id: string): Promise<PlanEntity | null> {
    try {
      logger.debug("Buscando plano por ID", { planId: id });

      const plan = await this.planRepository.findById(id);

      if (!plan) {
        logger.debug("Plano não encontrado", { planId: id });
        return null;
      }

      logger.debug("Plano encontrado", { planId: id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao buscar plano por ID", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Busca um plano por nome
   */
  async getPlanByName(name: string): Promise<PlanEntity | null> {
    try {
      logger.debug("Buscando plano por nome", { planName: name });

      const plan = await this.planRepository.findByName(name);

      if (!plan) {
        logger.debug("Plano não encontrado", { planName: name });
        return null;
      }

      logger.debug("Plano encontrado", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao buscar plano por nome", {
        planName: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cria um novo plano
   */
  async createPlan(data: Omit<PlanEntity, "id" | "createdAt" | "updatedAt">): Promise<PlanEntity> {
    try {
      logger.info("Criando novo plano", { planName: data.name });

      // Verificar se já existe um plano com o mesmo nome
      const existingPlanVariant = await this.planRepository.findByVariant(
        data.name,
        data.toggleId ?? null,
        data.toggleOptionValue ?? null
      );
      if (existingPlanVariant) {
        logger.warn("Já existe um plano com este nome nesta variante", {
          planName: data.name,
        });
        throw new Error(`Já existe um plano com o mesmo nome para esta opção`);
      }

      const plan = await this.planRepository.create(data);

      logger.info("Plano criado com sucesso", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao criar plano", {
        planName: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Atualiza um plano existente
   */
  async updatePlan(id: string, data: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt">>): Promise<PlanEntity> {
    try {
      logger.info("Atualizando plano", { planId: id });

      // Verificar se o plano existe
      const existingPlan = await this.planRepository.findById(id);
      if (!existingPlan) {
        logger.warn("Plano não encontrado para atualização", { planId: id });
        throw new Error("Plano não encontrado");
      }

      // Se está alterando o nome, verificar se não conflita com outro plano
      const desiredName = data.name ?? existingPlan.name;
      const desiredToggleId = data.toggleId ?? existingPlan.toggleId ?? null;
      const desiredToggleOptionValue = data.toggleOptionValue ?? existingPlan.toggleOptionValue ?? null;

      const conflict = await this.planRepository.findByVariant(
        desiredName,
        desiredToggleId,
        desiredToggleOptionValue
      );
      if (conflict && conflict.id !== id) {
        logger.warn("Já existe plano com mesmo nome nesta opção", {
          planName: desiredName,
        });
        throw new Error("Já existe outro plano com o mesmo nome para esta opção");
      }

      const plan = await this.planRepository.update(id, data);

      logger.info("Plano atualizado com sucesso", { planId: plan.id, planName: plan.name });

      return plan;
    } catch (error) {
      logger.error("Erro ao atualizar plano", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cria múltiplos planos de uma vez (mensal, trimestral e anual)
   */
  async createMultiplePlans(
    baseData: Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue">,
    plans: Array<{
      name: string;
      price: number;
      durationDays: number;
      toggleOptionValue?: string | null;
      checkoutUrl?: string | null;
    }>
  ): Promise<PlanEntity[]> {
    try {
      logger.info("Criando múltiplos planos", { count: plans.length });

      const createdPlans: PlanEntity[] = [];

      for (const planData of plans) {
        // Verificar se já existe um plano com o mesmo nome e variante
        const existingPlanVariant = await this.planRepository.findByVariant(
          planData.name,
          baseData.toggleId ?? null,
          planData.toggleOptionValue ?? null
        );
        if (existingPlanVariant) {
          logger.warn("Já existe um plano com este nome nesta variante", {
            planName: planData.name,
            toggleOptionValue: planData.toggleOptionValue,
          });
          throw new Error(`Já existe um plano com o nome "${planData.name}" para esta opção`);
        }

        const plan = await this.planRepository.create({
          ...baseData,
          name: planData.name,
          price: planData.price,
          durationDays: planData.durationDays,
          toggleOptionValue: planData.toggleOptionValue ?? null,
          // Usar o checkoutUrl específico do plano se fornecido, caso contrário usa o do baseData
          checkoutUrl: planData.checkoutUrl !== undefined ? planData.checkoutUrl : baseData.checkoutUrl,
        });

        createdPlans.push(plan);
        logger.debug("Plano criado", { planId: plan.id, planName: plan.name });
      }

      logger.info("Múltiplos planos criados com sucesso", { count: createdPlans.length });

      return createdPlans;
    } catch (error) {
      logger.error("Erro ao criar múltiplos planos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove um plano (soft delete)
   */
  async deletePlan(id: string): Promise<void> {
    try {
      logger.info("Removendo plano", { planId: id });

      // Verificar se o plano existe
      const existingPlan = await this.planRepository.findById(id);
      if (!existingPlan) {
        logger.warn("Plano não encontrado para remoção", { planId: id });
        throw new Error("Plano não encontrado");
      }

      await this.planRepository.delete(id);

      logger.info("Plano removido com sucesso", { planId: id });
    } catch (error) {
      logger.error("Erro ao remover plano", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Atualiza todos os planos com o mesmo nome (mesmo grupo)
   * Útil para atualizar mensal, trimestral e anual de uma vez
   */
  async updatePlansByGroup(
    planName: string,
    data: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue">>
  ): Promise<PlanEntity[]> {
    try {
      logger.info("Atualizando planos do grupo", { planName });

      // Buscar todos os planos com o mesmo nome
      const plans = await this.planRepository.findAllByName(planName);

      if (plans.length === 0) {
        logger.warn("Nenhum plano encontrado para o grupo", { planName });
        throw new Error("Nenhum plano encontrado com este nome");
      }

      // Atualizar cada plano do grupo
      const updatedPlans: PlanEntity[] = [];
      for (const plan of plans) {
        const updated = await this.planRepository.update(plan.id, data);
        updatedPlans.push(updated);
      }

      logger.info("Planos do grupo atualizados com sucesso", {
        planName,
        count: updatedPlans.length,
      });

      return updatedPlans;
    } catch (error) {
      logger.error("Erro ao atualizar planos do grupo", {
        planName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Atualiza os preços de todos os planos do grupo individualmente
   * Permite atualizar preços e links de checkout diferentes para mensal, trimestral e anual
   */
  async updatePlansPricesByGroup(
    planName: string,
    prices: {
      monthly?: number;
      quarterly?: number;
      annual?: number;
      monthlyCheckoutUrl?: string | null;
      quarterlyCheckoutUrl?: string | null;
      annualCheckoutUrl?: string | null;
    },
    otherData?: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt" | "name" | "price" | "durationDays" | "toggleOptionValue">>
  ): Promise<PlanEntity[]> {
    try {
      logger.info("Atualizando preços e links dos planos do grupo", { planName, prices });

      // Buscar todos os planos com o mesmo nome
      const plans = await this.planRepository.findAllByName(planName);

      if (plans.length === 0) {
        logger.warn("Nenhum plano encontrado para o grupo", { planName });
        throw new Error("Nenhum plano encontrado com este nome");
      }

      // Atualizar cada plano do grupo com seu preço específico e link de checkout
      const updatedPlans: PlanEntity[] = [];
      for (const plan of plans) {
        let updateData: Partial<Omit<PlanEntity, "id" | "createdAt" | "updatedAt">> = { ...otherData };

        // Atualizar preço e checkoutUrl baseado na duração
        if (plan.durationDays === 30) {
          if (prices.monthly !== undefined) updateData.price = prices.monthly;
          if (prices.monthlyCheckoutUrl !== undefined) updateData.checkoutUrl = prices.monthlyCheckoutUrl;
        } else if (plan.durationDays === 90) {
          if (prices.quarterly !== undefined) updateData.price = prices.quarterly;
          if (prices.quarterlyCheckoutUrl !== undefined) updateData.checkoutUrl = prices.quarterlyCheckoutUrl;
        } else if (plan.durationDays === 365) {
          if (prices.annual !== undefined) updateData.price = prices.annual;
          if (prices.annualCheckoutUrl !== undefined) updateData.checkoutUrl = prices.annualCheckoutUrl;
        }

        const updated = await this.planRepository.update(plan.id, updateData);
        updatedPlans.push(updated);
      }

      logger.info("Preços e links dos planos do grupo atualizados com sucesso", {
        planName,
        count: updatedPlans.length,
      });

      return updatedPlans;
    } catch (error) {
      logger.error("Erro ao atualizar preços e links dos planos do grupo", {
        planName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove todos os planos com o mesmo nome (mesmo grupo) - soft delete
   */
  async deletePlansByGroup(planName: string): Promise<void> {
    try {
      logger.info("Removendo planos do grupo", { planName });

      // Verificar se existem planos com esse nome
      const plans = await this.planRepository.findAllByName(planName);
      if (plans.length === 0) {
        logger.warn("Nenhum plano encontrado para o grupo", { planName });
        throw new Error("Nenhum plano encontrado com este nome");
      }

      await this.planRepository.deleteAllByName(planName);

      logger.info("Planos do grupo removidos com sucesso", { planName, count: plans.length });
    } catch (error) {
      logger.error("Erro ao remover planos do grupo", {
        planName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove permanentemente todos os planos com o mesmo nome (mesmo grupo) - hard delete
   */
  async deletePlansByGroupPermanently(planName: string): Promise<void> {
    try {
      logger.warn("Removendo permanentemente planos do grupo", { planName });

      // Verificar se existem planos com esse nome
      const plans = await this.planRepository.findAllByName(planName);
      if (plans.length === 0) {
        logger.warn("Nenhum plano encontrado para o grupo", { planName });
        throw new Error("Nenhum plano encontrado com este nome");
      }

      await this.planRepository.deleteAllByNamePermanently(planName);

      logger.info("Planos do grupo removidos permanentemente com sucesso", { planName, count: plans.length });
    } catch (error) {
      logger.error("Erro ao remover permanentemente planos do grupo", {
        planName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove um plano permanentemente do banco de dados (hard delete)
   */
  async deletePlanPermanently(id: string): Promise<void> {
    try {
      logger.warn("Removendo plano permanentemente", { planId: id });

      // Verificar se o plano existe
      const existingPlan = await this.planRepository.findById(id);
      if (!existingPlan) {
        logger.warn("Plano não encontrado para remoção permanente", { planId: id });
        throw new Error("Plano não encontrado");
      }

      await this.planRepository.deletePermanently(id);

      logger.info("Plano removido permanentemente com sucesso", { planId: id });
    } catch (error) {
      logger.error("Erro ao remover plano permanentemente", {
        planId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Router de Toggles de Planos
 *
 * Endpoints para gerenciamento de toggles de planos.
 */

import { logger } from "@/infrastructure/logger/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";
import { prisma } from "@/infrastructure/database/prisma";

const createToggleSchema = z.object({
  name: z.string().min(1, "Nome do toggle é obrigatório"),
  options: z.array(
    z.object({
      label: z.string().min(1, "Label é obrigatório"),
      value: z.string().min(1, "Value é obrigatório"),
    })
  ).optional().default([]), // Opções agora são opcionais
  isActive: z.boolean().default(true),
});

const updateToggleSchema = createToggleSchema.extend({
  id: z.string(),
});

export const planToggleRouter = createTRPCRouter({
  /**
   * Lista toggles ativos (público para visualização)
   */
  getActiveToggles: publicProcedure.query(async () => {
    try {
      logger.info("Listando toggles ativos");

      const toggles = await prisma.planToggle.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      logger.info("Toggles ativos listados com sucesso", { count: toggles.length });

      return toggles.map((toggle) => {
        // Parse options - Prisma retorna JSON como objeto JavaScript
        let options: Array<{ label: string; value: string }> = [];
        try {
          logger.debug("Parsing toggle options", {
            toggleId: toggle.id,
            toggleName: toggle.name,
            optionsType: typeof toggle.options,
            optionsValue: toggle.options,
            isArray: Array.isArray(toggle.options),
          });

          if (Array.isArray(toggle.options)) {
            // Validar que cada item tem label e value
            options = toggle.options
              .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
              .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
          } else if (toggle.options && typeof toggle.options === "object") {
            // Se for objeto, tentar converter para array
            const asArray = Array.isArray(toggle.options) ? toggle.options : [toggle.options];
            options = asArray
              .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
              .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
          } else if (typeof toggle.options === "string") {
            const trimmed = toggle.options.trim();
            if (trimmed && trimmed !== "" && trimmed !== "null") {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                options = parsed
                  .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
                  .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
              }
            }
          }
        } catch (error) {
          logger.error("Erro ao fazer parse das options", {
            toggleId: toggle.id,
            error: error instanceof Error ? error.message : String(error),
          });
          options = [];
        }

        logger.debug("Toggle processado", {
          toggleId: toggle.id,
          toggleName: toggle.name,
          optionsCount: options.length,
          options,
        });

        return {
          id: toggle.id,
          name: toggle.name,
          options: Array.isArray(options) ? options : [],
          isActive: toggle.isActive,
          createdAt: toggle.createdAt.toISOString(),
          updatedAt: toggle.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      logger.error("Erro ao listar toggles ativos", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar toggles ativos",
      });
    }
  }),

  /**
   * Lista todos os toggles (apenas para admins)
   */
  getAllToggles: adminProcedure.query(async () => {
    try {
      logger.info("Listando todos os toggles");

      const toggles = await prisma.planToggle.findMany({
        orderBy: { name: "asc" },
      });

      logger.info("Toggles listados com sucesso", { count: toggles.length });

      return toggles.map((toggle) => {
        // Parse options - pode ser array ou JSON string
        let options: Array<{ label: string; value: string }> = [];
        try {
          if (Array.isArray(toggle.options)) {
            // Validar que cada item tem label e value
            options = toggle.options
              .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
              .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
          } else if (typeof toggle.options === "string") {
            const trimmed = toggle.options.trim();
            if (trimmed && trimmed !== "" && trimmed !== "null") {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                options = parsed
                  .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
                  .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
              }
            }
          } else if (toggle.options && typeof toggle.options === "object") {
            // Se for objeto, tentar converter para array
            const asArray = Array.isArray(toggle.options) ? toggle.options : [toggle.options];
            options = asArray
              .filter((opt: any) => opt && typeof opt === "object" && opt.label && opt.value)
              .map((opt: any) => ({ label: String(opt.label), value: String(opt.value) }));
          }
        } catch (e) {
          logger.error(`Erro ao fazer parse das opções do toggle ${toggle.id}: ${toggle.name}`, { options: toggle.options, error: e });
          options = [];
        }

        return {
          id: toggle.id,
          name: toggle.name,
          options: options,
          isActive: toggle.isActive,
          createdAt: toggle.createdAt.toISOString(),
          updatedAt: toggle.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      logger.error("Erro ao listar toggles", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar toggles",
      });
    }
  }),

  /**
   * Busca um toggle por ID
   */
  getToggleById: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      logger.info("Buscando toggle por ID", { toggleId: input.id });

      const toggle = await prisma.planToggle.findUnique({
        where: { id: input.id },
      });

      if (!toggle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Toggle não encontrado",
        });
      }

      return {
        id: toggle.id,
        name: toggle.name,
        options: toggle.options as Array<{ label: string; value: string }>,
        isActive: toggle.isActive,
        createdAt: toggle.createdAt.toISOString(),
        updatedAt: toggle.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      logger.error("Erro ao buscar toggle", {
        toggleId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao buscar toggle",
      });
    }
  }),

  /**
   * Cria um novo toggle (apenas para admins)
   */
  createToggle: adminProcedure.input(createToggleSchema).mutation(async ({ input }) => {
    try {
      logger.info("Criando novo toggle", {
        toggleName: input.name,
        options: input.options,
        optionsCount: input.options?.length || 0,
        isActive: input.isActive,
      });

      const toggle = await prisma.planToggle.create({
        data: {
          name: input.name,
          options: input.options || [],
          isActive: input.isActive,
        },
      });

      logger.info("Toggle criado com sucesso", {
        toggleId: toggle.id,
        toggleName: toggle.name,
        optionsSaved: toggle.options,
        optionsType: typeof toggle.options,
      });

      return {
        id: toggle.id,
        name: toggle.name,
        options: toggle.options as Array<{ label: string; value: string }>,
        isActive: toggle.isActive,
        createdAt: toggle.createdAt.toISOString(),
        updatedAt: toggle.updatedAt.toISOString(),
      };
    } catch (error) {
      logger.error("Erro ao criar toggle", {
        toggleName: input.name,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("Unique constraint")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um toggle com este nome",
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao criar toggle",
      });
    }
  }),

  /**
   * Atualiza um toggle (apenas para admins)
   */
  updateToggle: adminProcedure.input(updateToggleSchema).mutation(async ({ input }) => {
    try {
      logger.info("Atualizando toggle", {
        toggleId: input.id,
        toggleName: input.name,
        options: input.options,
        optionsCount: input.options?.length || 0,
        isActive: input.isActive,
      });

      const toggle = await prisma.planToggle.update({
        where: { id: input.id },
        data: {
          name: input.name,
          options: input.options || [],
          isActive: input.isActive,
        },
      });

      logger.info("Toggle atualizado com sucesso", {
        toggleId: toggle.id,
        toggleName: toggle.name,
        optionsSaved: toggle.options,
        optionsType: typeof toggle.options,
      });

      return {
        id: toggle.id,
        name: toggle.name,
        options: toggle.options as Array<{ label: string; value: string }>,
        isActive: toggle.isActive,
        createdAt: toggle.createdAt.toISOString(),
        updatedAt: toggle.updatedAt.toISOString(),
      };
    } catch (error) {
      logger.error("Erro ao atualizar toggle", {
        toggleId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao atualizar toggle",
      });
    }
  }),

  /**
   * Remove um toggle (apenas para admins)
   */
  deleteToggle: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      logger.info("Removendo toggle", { toggleId: input.id });

      await prisma.planToggle.delete({
        where: { id: input.id },
      });

      logger.info("Toggle removido com sucesso", { toggleId: input.id });

      return { success: true };
    } catch (error) {
      logger.error("Erro ao remover toggle", {
        toggleId: input.id,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("não encontrado")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao remover toggle",
      });
    }
  }),

  /**
   * Adiciona uma opção a um toggle existente
   */
  addToggleOption: adminProcedure
    .input(
      z.object({
        toggleId: z.string(),
        label: z.string().min(1, "Label é obrigatório"),
        value: z.string().min(1, "Value é obrigatório"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("Adicionando opção ao toggle", { toggleId: input.toggleId });

        const toggle = await prisma.planToggle.findUnique({
          where: { id: input.toggleId },
        });

        if (!toggle) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Toggle não encontrado",
          });
        }

        const currentOptions = (toggle.options as Array<{ label: string; value: string }>) || [];
        const newOption = { label: input.label, value: input.value };

        // Verificar se já existe uma opção com o mesmo value
        if (currentOptions.some((opt) => opt.value === input.value)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe uma opção com este valor",
          });
        }

        const updatedOptions = [...currentOptions, newOption];

        const updated = await prisma.planToggle.update({
          where: { id: input.toggleId },
          data: {
            options: updatedOptions,
          },
        });

        logger.info("Opção adicionada com sucesso", { toggleId: input.toggleId });

        return {
          id: updated.id,
          name: updated.name,
          options: updated.options as Array<{ label: string; value: string }>,
          isActive: updated.isActive,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        logger.error("Erro ao adicionar opção ao toggle", {
          toggleId: input.toggleId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao adicionar opção ao toggle",
        });
      }
    }),

  /**
   * Remove uma opção de um toggle
   */
  removeToggleOption: adminProcedure
    .input(
      z.object({
        toggleId: z.string(),
        optionValue: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        logger.info("Removendo opção do toggle", { toggleId: input.toggleId, optionValue: input.optionValue });

        const toggle = await prisma.planToggle.findUnique({
          where: { id: input.toggleId },
        });

        if (!toggle) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Toggle não encontrado",
          });
        }

        const currentOptions = (toggle.options as Array<{ label: string; value: string }>) || [];
        const updatedOptions = currentOptions.filter((opt) => opt.value !== input.optionValue);

        const updated = await prisma.planToggle.update({
          where: { id: input.toggleId },
          data: {
            options: updatedOptions,
          },
        });

        logger.info("Opção removida com sucesso", { toggleId: input.toggleId });

        return {
          id: updated.id,
          name: updated.name,
          options: updated.options as Array<{ label: string; value: string }>,
          isActive: updated.isActive,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        logger.error("Erro ao remover opção do toggle", {
          toggleId: input.toggleId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao remover opção do toggle",
        });
      }
    }),
});


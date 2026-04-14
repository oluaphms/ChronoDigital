/**
 * Admin User Service
 * 
 * Serviço para administradores criarem usuários (funcionários)
 */

import { auth, db, isSupabaseConfigured } from './supabaseClient';
import { User, UserRole } from '../types';
import { LoggingService } from './loggingService';
import { LogSeverity } from '../types';
import ExcelJS from 'exceljs';

export interface CreateUserData {
  nome: string;
  email: string;
  password: string;
  cargo: string;
  departmentId?: string;
  role?: UserRole;
}

export interface CreateUserResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface ImportResult {
  total: number;
  success: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

class AdminUserService {
  /**
   * Criar um novo funcionário (apenas para admins)
   */
  async createEmployee(
    admin: User,
    data: CreateUserData
  ): Promise<CreateUserResult> {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase não configurado' };
    }

    if (admin.role !== 'admin') {
      return { success: false, error: 'Apenas administradores podem criar funcionários' };
    }

    try {
      // Validar dados
      if (!data.nome || !data.email || !data.password || !data.cargo) {
        return { success: false, error: 'Dados incompletos' };
      }

      if (data.password.length < 6) {
        return { success: false, error: 'Senha deve ter no mínimo 6 caracteres' };
      }

      // Criar usuário no Supabase Auth
      let authData;
      try {
        authData = await auth.signUp(
          data.email,
          data.password,
          {
            nome: data.nome,
            company_id: admin.companyId,
          }
        );
      } catch (authError: any) {
        if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
          return { success: false, error: 'Este email já está em uso' };
        }
        return { success: false, error: authError.message || 'Erro ao criar usuário no sistema de autenticação' };
      }

      if (!authData || !authData.user) {
        return { success: false, error: 'Erro ao criar usuário no sistema de autenticação' };
      }

      // Criar registro na tabela users
      const newUser: User = {
        id: authData.user.id,
        nome: data.nome,
        email: data.email,
        cargo: data.cargo,
        role: data.role || 'employee',
        createdAt: new Date(),
        companyId: admin.companyId,
        tenantId: admin.companyId,
        departmentId: data.departmentId || '',
        avatar: authData.user.user_metadata?.avatar_url,
        preferences: {
          notifications: true,
          theme: 'light',
          allowManualPunch: true,
          language: 'pt-BR',
        },
      };

      await db.insert('users', {
        id: newUser.id,
        nome: newUser.nome,
        email: newUser.email,
        cargo: newUser.cargo,
        role: newUser.role,
        company_id: newUser.companyId,
        department_id: newUser.departmentId,
        avatar: newUser.avatar,
        preferences: newUser.preferences,
        created_at: newUser.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Registrar em audit log
      await LoggingService.log({
        severity: LogSeverity.INFO,
        action: 'USER_CREATED',
        userId: admin.id,
        companyId: admin.companyId,
        details: {
          createdUserId: newUser.id,
          createdUserEmail: newUser.email,
          createdUserName: newUser.nome,
        },
      });

      return { success: true, user: newUser };
    } catch (error: any) {
      const errorMessage = error.message || 'Erro ao criar funcionário';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Importar múltiplos funcionários de uma planilha
   */
  async importEmployees(
    admin: User,
    file: File
  ): Promise<ImportResult> {
    if (!isSupabaseConfigured) {
      return { total: 0, success: 0, errors: [{ row: 0, email: '', error: 'Supabase não configurado' }] };
    }

    if (admin.role !== 'admin') {
      return { total: 0, success: 0, errors: [{ row: 0, email: '', error: 'Apenas administradores podem importar funcionários' }] };
    }

    const errors: Array<{ row: number; email: string; error: string }> = [];
    let success = 0;
    let total = 0;

    try {
      // Ler arquivo
      const workbook = new ExcelJS.Workbook();
      
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return { total: 0, success: 0, errors: [{ row: 0, email: '', error: 'Planilha vazia ou inválida' }] };
      }

      // Encontrar índices das colunas
      const headerRow = worksheet.getRow(1);
      const columnMap: Record<string, number> = {};
      
      headerRow.eachCell((cell, colNumber) => {
        const value = cell.value?.toString().toLowerCase().trim();
        if (value) {
          columnMap[value] = colNumber;
        }
      });

      // Validar colunas obrigatórias
      const requiredColumns = ['nome', 'email', 'senha', 'cargo'];
      const missingColumns = requiredColumns.filter(col => !columnMap[col]);
      
      if (missingColumns.length > 0) {
        return {
          total: 0,
          success: 0,
          errors: [{ row: 0, email: '', error: `Colunas obrigatórias faltando: ${missingColumns.join(', ')}` }],
        };
      }

      // Processar cada linha (começando da linha 2)
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        total++;

        const nome = row.getCell(columnMap['nome'])?.value?.toString().trim();
        const email = row.getCell(columnMap['email'])?.value?.toString().trim();
        const senha = row.getCell(columnMap['senha'])?.value?.toString().trim();
        const cargo = row.getCell(columnMap['cargo'])?.value?.toString().trim();
        const departamento = row.getCell(columnMap['departamento'])?.value?.toString().trim() || '';
        const role = (row.getCell(columnMap['role'])?.value?.toString().trim() || 'employee') as UserRole;

        // Validar linha
        if (!nome || !email || !senha || !cargo) {
          errors.push({
            row: rowNumber,
            email: email || 'N/A',
            error: 'Dados incompletos (nome, email, senha e cargo são obrigatórios)',
          });
          continue;
        }

        if (senha.length < 6) {
          errors.push({
            row: rowNumber,
            email,
            error: 'Senha deve ter no mínimo 6 caracteres',
          });
          continue;
        }

        // Criar funcionário
        const result = await this.createEmployee(admin, {
          nome,
          email,
          password: senha,
          cargo,
          departmentId: departamento,
          role,
        });

        if (result.success) {
          success++;
        } else {
          errors.push({
            row: rowNumber,
            email,
            error: result.error || 'Erro desconhecido',
          });
        }
      }

      // Registrar importação em audit log
      await LoggingService.log({
        severity: LogSeverity.INFO,
        action: 'BULK_USER_IMPORT',
        userId: admin.id,
        companyId: admin.companyId,
        details: {
          total,
          success,
          errors: errors.length,
        },
      });

      return { total, success, errors };
    } catch (error: any) {
      return {
        total,
        success,
        errors: [
          ...errors,
          { row: 0, email: '', error: `Erro ao processar planilha: ${error.message}` },
        ],
      };
    }
  }

  /**
   * Gerar modelo de planilha para download
   */
  async downloadTemplate(): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Funcionários');

    // Cabeçalhos
    worksheet.columns = [
      { header: 'Nome', key: 'nome', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Senha', key: 'senha', width: 20 },
      { header: 'Cargo', key: 'cargo', width: 25 },
      { header: 'Departamento', key: 'departamento', width: 20 },
      { header: 'Role', key: 'role', width: 15 },
    ];

    // Estilizar cabeçalho
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Exemplo de linha
    worksheet.addRow({
      nome: 'João Silva',
      email: 'joao.silva@empresa.com',
      senha: 'senha123',
      cargo: 'Desenvolvedor',
      departamento: 'TI',
      role: 'employee',
    });

    // Gerar arquivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_cadastro_funcionarios.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

export const adminUserService = new AdminUserService();

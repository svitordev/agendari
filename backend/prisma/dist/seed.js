"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Iniciando seed do banco de dados...');
    // 1. Criar profissional parceira
    const professional = await prisma.professional.upsert({
        where: { slug: 'jessicasantana' },
        update: {},
        create: {
            slug: 'jessicasantana',
            name: 'Jéssica Santana',
            bio: 'Especialista em unhas com mais de 8 anos de experiência. Unhas que combinam arte e cuidado.',
            instagram: '@jessica.nails',
            themeColors: {
                primary: '#FF69B4',
                secondary: '#FFC0CB',
                accent: '#FFF0F5',
            },
        },
    });
    // 2. Criar User vinculado ao profissional
    const hashedPassword = await bcrypt.hash('password123', 10);
    await prisma.user.upsert({
        where: { email: 'jessica@pex.com' },
        update: {},
        create: {
            email: 'jessica@pex.com',
            password: hashedPassword,
            firstName: 'Jéssica',
            lastName: 'Santana',
            role: 'PROFESSIONAL',
            professionalId: professional.id,
        },
    });
    console.log('✅ Profissional criada:', professional.name);
    // 3. Criar Serviços
    const servicesData = [
        { name: 'Manicure Clássica', description: 'Cutilada, lixamento, hidratação e esmaltação tradicional.', durationMinutes: 45, price: 35.0 },
        { name: 'Esmaltação em Gel', description: 'Esmaltação em gel de longa duração com acabamento impecável.', durationMinutes: 60, price: 65.0 },
        { name: 'Alongamento em Fibra de Vidro', description: 'Alongamento completo em fibra de vidro com design inclusivo.', durationMinutes: 120, price: 180.0 },
        { name: 'Unhas Russas', description: 'Técnica rusa de refinamento perfeito da cutícula.', durationMinutes: 60, price: 75.0 },
        { name: 'Spa dos Pé / Pedicure', description: 'Hidratação completa dos pés com parafina e esfoliante.', durationMinutes: 45, price: 50.0 },
        { name: 'Nail Design Exclusivo', description: 'Design artístico feito à mão (preço por unha).', durationMinutes: 30, price: 15.0 },
    ];
    for (const s of servicesData) {
        await prisma.service.create({
            data: { ...s, professionalId: professional.id },
        });
    }
    console.log(`✅ ${servicesData.length} serviços criados`);
    // 4. Criar Disponibilidade Semanal
    const availabilities = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }, // Segunda
        { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' }, // Terça
        { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' }, // Quarta
        { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' }, // Quinta
        { dayOfWeek: 5, startTime: '09:00', endTime: '18:00' }, // Sexta
        { dayOfWeek: 6, startTime: '09:00', endTime: '14:00' }, // Sábado
    ];
    for (const a of availabilities) {
        await prisma.availability.upsert({
            where: {
                professionalId_dayOfWeek: {
                    professionalId: professional.id,
                    dayOfWeek: a.dayOfWeek,
                },
            },
            update: a,
            create: { ...a, professionalId: professional.id },
        });
    }
    console.log('✅ Disponibilidade semanal configurada');
    // 5. Criar cliente de exemplo
    const customer = await prisma.customer.create({
        data: {
            name: 'Maria Silva',
            phone: '+5511999999999',
            email: 'maria@email.com',
        },
    });
    // 6. Criar agendamento de teste (próximas segunda-feira)
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 - nextMonday.getDay() + 7) % 7));
    if (nextMonday.getDay() === 0)
        nextMonday.setDate(nextMonday.getDate() + 1); // Ajuste se for hoje domingo
    nextMonday.setHours(10, 0, 0, 0);
    const manicureService = await prisma.service.findFirst({
        where: { professionalId: professional.id, name: 'Manicure Clássica' },
    });
    if (manicureService) {
        await prisma.appointment.create({
            data: {
                date: nextMonday,
                professionalId: professional.id,
                serviceId: manicureService.id,
                customerId: customer.id,
                status: 'CONFIRMED',
            },
        });
        console.log('✅ Agendamento de teste criado');
    }
    console.log('\n🎉 Seed concluído com sucesso!');
    console.log('\n📋 Dados criados:');
    console.log('   Profissional:', professional.name);
    console.log('   User Email: jessica@pex.com / password123');
    console.log(`   Serviços: ${servicesData.length}`);
    console.log(`   Disponibilidade: Seg-Sex 09h-18h, Sáb 09h-14h`);
}
main()
    .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});

import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import prisma from './prisma';

export const authOptions = {
    providers: [
       CredentialsProvider({
            name: "Credentials",
            async authorize(credentials) {
                const user = await prisma.user.findUnique({
                    where: { email: credentials.email }
                });

                if (!user) throw new Error("用戶不存在");
                const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

                if (!isValid) throw new Error("密碼錯誤");

                return user;
            }
       }) 
    ]
};
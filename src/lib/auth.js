import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import dbConnect from './db';
import User from './models/User';
import bcrypt from 'bcryptjs';

const providers = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Username / Email', type: 'text' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      await dbConnect();

      if (!credentials?.email || !credentials?.password) {
        throw new Error('Please enter username/email and password');
      }

      // Query by email OR roll number
      const user = await User.findOne({
        $or: [
          { email: credentials.email.toLowerCase().trim() },
          { rollNumber: credentials.email.trim() },
        ],
      });

      if (!user) {
        throw new Error('No user found with this email or roll number');
      }

      const isValid = await bcrypt.compare(credentials.password, user.password);
      if (!isValid) {
        throw new Error('Incorrect password');
      }

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        wing: user.wing,
        cleanPlateScore: user.cleanPlateScore,
        needsPasswordChange: user.needsPasswordChange || false,
      };
    },
  }),
];

// Only register Google when real credentials exist (avoids mock-id in production)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions = {
  providers,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.wing = user.wing;
        token.cleanPlateScore = user.cleanPlateScore;
        token.needsPasswordChange = user.needsPasswordChange;
      }

      if (trigger === 'update' && session) {
        if (session.cleanPlateScore !== undefined) {
          token.cleanPlateScore = session.cleanPlateScore;
        }
        if (session.needsPasswordChange !== undefined) {
          token.needsPasswordChange = session.needsPasswordChange;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.wing = token.wing;
        session.user.cleanPlateScore = token.cleanPlateScore;
        session.user.needsPasswordChange = token.needsPasswordChange;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
export default authOptions;

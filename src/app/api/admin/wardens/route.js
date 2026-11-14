import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import AccountAudit from '@/lib/models/AccountAudit';
import AccountSetupToken from '@/lib/models/AccountSetupToken';
import { requireRoles, VALID_WINGS } from '@/lib/authorization';
import { demoMutationResponse } from '@/lib/demoLimits';
import { canMutateAccount } from '@/lib/accessPolicy';
import { deliverSetupLink } from '@/lib/invitationDelivery';

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

function getSetupBaseUrl() {
  if (!process.env.NEXTAUTH_URL) throw new Error('NEXTAUTH_URL must be configured before issuing setup links.');
  const url = new URL(process.env.NEXTAUTH_URL);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Production account setup links require an HTTPS NEXTAUTH_URL.');
  }
  return url.origin;
}

async function createSetupToken(account, purpose) {
  const baseUrl = getSetupBaseUrl();
  const token = randomBytes(32).toString('base64url');
  await AccountSetupToken.create({
    user: account._id,
    purpose,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
  });
  const setupUrl = new URL('/account/setup', baseUrl);
  setupUrl.searchParams.set('token', token);
  return setupUrl.toString();
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  try {
    await dbConnect();
    const { response } = await requireRoles(['ADMIN']);
    if (response) return response;
    const wardens = await User.find({ role: 'WARDEN' })
      .select('name email wing active createdAt isDemoAccount')
      .sort({ name: 1 })
      .lean();
    return NextResponse.json({
      success: true,
      wardens: wardens.map((warden) => ({ ...warden, id: warden._id.toString() })),
    });
  } catch (error) {
    console.error('[API Admin Wardens GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unable to load wardens.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await dbConnect();
    const { user: actor, response } = await requireRoles(['ADMIN']);
    if (response) return response;
    getSetupBaseUrl();
    const rateLimitError = await demoMutationResponse(actor);
    if (rateLimitError) {
      return NextResponse.json(rateLimitError, { status: 429 });
    }

    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const wing = body.wing;
    if (!name || !isValidEmail(email) || !VALID_WINGS.includes(wing)) {
      return NextResponse.json({ success: false, error: 'Name, valid email, and wing are required.' }, { status: 400 });
    }
    if (process.env.DEMO_MODE === 'true' && await User.countDocuments({ role: 'WARDEN', isDemoData: true }) >= 10) {
      return NextResponse.json({ success: false, error: 'Demo warden account limit reached.' }, { status: 400 });
    }
    if (await User.exists({ email })) {
      return NextResponse.json({ success: false, error: 'Email is already registered.' }, { status: 409 });
    }

    const account = await User.create({
      name,
      email,
      role: 'WARDEN',
      wing,
      password: await bcrypt.hash(randomBytes(32).toString('base64url'), 12),
      needsPasswordChange: true,
      active: true,
      authVersion: 0,
      isDemoAccount: false,
      isDemoData: process.env.DEMO_MODE === 'true',
    });
    const setupUrl = await createSetupToken(account, 'INVITATION');
    await AccountAudit.create([
      { actor: actor._id, target: account._id, action: 'ACCOUNT_CREATED' },
      { actor: actor._id, target: account._id, action: 'INVITATION_ISSUED' },
    ]);
    let invitation;
    try {
      invitation = await deliverSetupLink(account, setupUrl);
    } catch (error) {
      console.error('[API Admin Wardens] Invitation delivery failed:', error.message);
      invitation = { status: 'failed' };
    }

    return NextResponse.json({
      success: true,
      warden: {
        id: account._id.toString(),
        name: account.name,
        email: account.email,
        wing: account.wing,
        active: account.active,
        isDemoAccount: account.isDemoAccount,
      },
      invitation,
      message:
        invitation.status === 'sent'
          ? 'Invitation delivered.'
          : invitation.status === 'preview'
            ? 'Development invitation preview created; no email was sent.'
            : invitation.status === 'failed'
              ? 'Account created, but invitation delivery failed. No delivery was confirmed; issue a new setup link after checking the mail provider.'
              : 'Account created, but email delivery is not configured. Configure the mail integration and issue a new invitation.',
    }, { status: 201 });
  } catch (error) {
    console.error('[API Admin Wardens POST] Error:', error);
    return NextResponse.json({ success: false, error: 'Unable to create warden or deliver invitation.' }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    await dbConnect();
    const { user: actor, response } = await requireRoles(['ADMIN']);
    if (response) return response;
    const rateLimitError = await demoMutationResponse(actor);
    if (rateLimitError) {
      return NextResponse.json(rateLimitError, { status: 429 });
    }

    const { wardenId, action, wing } = await req.json();
    if (action === 'issue-setup') getSetupBaseUrl();
    const warden = await User.findById(wardenId);
    if (!warden || warden.role !== 'WARDEN') {
      return NextResponse.json({ success: false, error: 'Warden account not found.' }, { status: 404 });
    }
    if (!canMutateAccount(warden)) {
      return NextResponse.json({ success: false, error: 'Protected demo entry accounts cannot be changed.' }, { status: 403 });
    }

    let auditAction;
    if (action === 'change-wing') {
      if (!VALID_WINGS.includes(wing)) {
        return NextResponse.json({ success: false, error: 'Select a valid wing.' }, { status: 400 });
      }
      if (warden.wing !== wing) {
        warden.wing = wing;
        auditAction = 'WARDEN_WING_CHANGED';
      }
    } else if (action === 'activate' || action === 'deactivate') {
      const active = action === 'activate';
      if (warden.active !== active) {
        warden.active = active;
        auditAction = active ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED';
      }
    } else if (action === 'issue-setup') {
      if (warden.active === false) {
        return NextResponse.json(
          { success: false, error: 'Activate the warden account before issuing a setup link.' },
          { status: 400 }
        );
      }
      const tokenPurpose = warden.needsPasswordChange ? 'INVITATION' : 'PASSWORD_RESET';
      warden.password = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
      warden.needsPasswordChange = true;
      warden.authVersion = (warden.authVersion || 0) + 1;
      await AccountSetupToken.updateMany(
        { user: warden._id, consumedAt: null },
        { $set: { consumedAt: new Date() } }
      );
      await warden.save();
      const setupUrl = await createSetupToken(warden, tokenPurpose);
      await AccountAudit.create([
        { actor: actor._id, target: warden._id, action: 'INVITATION_ISSUED' },
        ...(tokenPurpose === 'PASSWORD_RESET'
          ? [{ actor: actor._id, target: warden._id, action: 'PASSWORD_RESET' }]
          : []),
      ]);
      let invitation;
      try {
        invitation = await deliverSetupLink(warden, setupUrl);
      } catch (error) {
        console.error('[API Admin Wardens] Invitation delivery failed:', error.message);
        invitation = { status: 'failed' };
      }
      if (global.io) global.io.in(`user:${warden._id}`).disconnectSockets(true);
      return NextResponse.json({
        success: true,
        warden: { id: warden.id, wing: warden.wing, active: warden.active },
        invitation,
        message:
          invitation.status === 'failed'
            ? 'A new setup link was issued, but delivery failed. No delivery was confirmed.'
            : invitation.status === 'not_configured'
              ? 'A setup link was issued, but email delivery is not configured.'
              : invitation.status === 'preview'
                ? 'Development invitation preview created; no email was sent.'
                : 'Invitation delivered.',
      });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid account action.' }, { status: 400 });
    }

    if (auditAction) {
      warden.authVersion = (warden.authVersion || 0) + 1;
      await warden.save();
      await AccountAudit.create({ actor: actor._id, target: warden._id, action: auditAction });
      if (global.io) global.io.in(`user:${warden._id}`).disconnectSockets(true);
    }
    return NextResponse.json({
      success: true,
      warden: {
        id: warden._id.toString(),
        name: warden.name,
        email: warden.email,
        wing: warden.wing,
        active: warden.active,
        isDemoAccount: warden.isDemoAccount,
      },
    });
  } catch (error) {
    console.error('[API Admin Wardens PATCH] Error:', error);
    return NextResponse.json({ success: false, error: 'Unable to update warden account.' }, { status: 500 });
  }
}

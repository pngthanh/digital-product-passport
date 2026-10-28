import {
  FakePasswordHasher,
  FakeSessionTokens,
  InMemoryIdentityStore,
  recordingAudit,
} from '../../../../test/support/identity-fakes.js';
import {
  AccountNotActiveError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  WeakPasswordError,
} from '../domain/identity.errors.js';
import { RegisterAccount } from './register-account.use-case.js';
import { ResolveSession } from './resolve-session.use-case.js';
import { SignIn } from './sign-in.use-case.js';
import { SignOut } from './sign-out.use-case.js';

const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

function setup() {
  const store = new InMemoryIdentityStore();
  const hasher = new FakePasswordHasher();
  const sessions = new FakeSessionTokens();
  const { audit, writer } = recordingAudit();
  return {
    store,
    hasher,
    writer,
    register: new RegisterAccount(store, hasher, sessions, audit),
    signIn: new SignIn(store, hasher, sessions, audit),
    signOut: new SignOut(store, audit),
    resolve: new ResolveSession(store, sessions),
  };
}

describe('ACC-01 Đăng ký tài khoản', () => {
  it('tạo users + parties, lưu mật khẩu đã băm, đăng nhập luôn', async () => {
    const { store, register, writer } = setup();

    const { account, session } = await register.execute(
      { email: '  An.Nguyen@Example.com ', password: 'mat khau dai', fullName: ' Nguyễn An ' },
      client,
    );

    expect(account).toMatchObject({ email: 'an.nguyen@example.com', fullName: 'Nguyễn An' });
    expect(account.passwordHash).not.toBe('mat khau dai');
    expect(account.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(store.partyOfUser(account.id)).toMatchObject({ chainPartyId: null });
    expect(session.token).toBe(`session.${account.id}.0`);
    expect(writer.actions()).toEqual(['ACCOUNT_REGISTERED']);
  });

  it('từ chối mật khẩu yếu trước khi tạo tài khoản', async () => {
    const { store, register } = setup();

    await expect(
      register.execute({ email: 'an@example.com', password: 'ngan', fullName: 'An' }, client),
    ).rejects.toBeInstanceOf(WeakPasswordError);
    expect(store.accounts.size).toBe(0);
  });

  it('từ chối email đã đăng ký, không phân biệt hoa thường', async () => {
    const { register } = setup();
    await register.execute(
      { email: 'an@example.com', password: 'mat khau dai', fullName: 'An' },
      client,
    );

    await expect(
      register.execute(
        { email: 'AN@example.com', password: 'mat khau khac', fullName: 'An' },
        client,
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });
});

async function registered() {
  const context = setup();
  const { account } = await context.register.execute(
    { email: 'binh@example.com', password: 'mat khau dai', fullName: 'Bình' },
    client,
  );
  return { ...context, account };
}

describe('ACC-02 Đăng nhập, đăng xuất', () => {
  it('đăng nhập đúng mật khẩu nhận phiên mang session_version hiện tại', async () => {
    const { signIn, account } = await registered();

    const { session } = await signIn.execute(
      { email: 'BINH@example.com', password: 'mat khau dai' },
      client,
    );

    expect(session.token).toBe(`session.${account.id}.0`);
  });

  it('sai mật khẩu và email không tồn tại trả cùng một lỗi, có ghi audit', async () => {
    const { signIn, hasher, writer } = await registered();

    await expect(
      signIn.execute({ email: 'binh@example.com', password: 'sai mat khau' }, client),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      signIn.execute({ email: 'khong-co@example.com', password: 'mat khau dai' }, client),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(hasher.dummyVerifications).toBe(1);
    expect(writer.actions().filter((action) => action === 'SIGN_IN_FAILED')).toHaveLength(2);
  });

  it('tài khoản bị khoá chỉ được báo khi mật khẩu đúng', async () => {
    const { signIn, store, account } = await registered();
    store.accounts.set(account.id, { ...account, status: 'LOCKED' });

    await expect(
      signIn.execute({ email: 'binh@example.com', password: 'sai mat khau' }, client),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      signIn.execute({ email: 'binh@example.com', password: 'mat khau dai' }, client),
    ).rejects.toBeInstanceOf(AccountNotActiveError);
  });

  it('đăng xuất làm mọi token đã cấp hết hiệu lực (session_version tăng)', async () => {
    const { signIn, signOut, resolve, account } = await registered();
    const { session } = await signIn.execute(
      { email: 'binh@example.com', password: 'mat khau dai' },
      client,
    );
    expect(await resolve.execute(session.token)).toMatchObject({ id: account.id });

    await signOut.execute(account.id, client);

    expect(await resolve.execute(session.token)).toBeNull();
  });

  it('phiên của tài khoản bị khoá không còn dùng được', async () => {
    const { resolve, store, account } = await registered();
    const token = `session.${account.id}.0`;
    store.accounts.set(account.id, { ...account, status: 'LOCKED' });

    expect(await resolve.execute(token)).toBeNull();
    expect(await resolve.execute(undefined)).toBeNull();
    expect(await resolve.execute('rac')).toBeNull();
  });
});

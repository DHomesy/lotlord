const userRepo = require('../dal/userRepository');

async function getMe(req, res, next) {
  try {
    const user = await userRepo.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    // Users may only view their own profile; admins may view any user
    if (req.user.role !== 'admin' && req.user.sub !== req.params.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await userRepo.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
}

async function listUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, role } = req.query;
    const users = await userRepo.findAll({ page: Number(page), limit: Number(limit), role });
    res.json(users);
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    // Users can update themselves; admins can update anyone
    const targetId = req.params.id;
    if (req.user.role !== 'admin' && req.user.sub !== targetId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const updated = await userRepo.update(targetId, {
      first_name: firstName, last_name: lastName, phone, avatar_url: avatarUrl,
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = { getMe, getUser, listUsers, updateUser };

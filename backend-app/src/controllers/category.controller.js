const { getPool } = require('../config/db.sql');
const { success, error } = require('../utils/response');

const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getCategories = async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT CategoryID AS id, Name AS name, Slug AS slug, Icon AS icon
      FROM Categories
      ORDER BY Name
    `);
    return success(res, result.recordset, 'Categories retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const createCategory = async (req, res) => {
  const { name, icon } = req.body;

  if (!name) {
    return error(res, 'Category name is required', 400);
  }

  try {
    const slug = req.body.slug || slugify(name);
    const result = await getPool().request()
      .input('name', name)
      .input('slug', slug)
      .input('icon', icon || null)
      .query(`
        INSERT INTO Categories (Name, Slug, Icon)
        OUTPUT INSERTED.CategoryID AS id, INSERTED.Name AS name, INSERTED.Slug AS slug
        VALUES (@name, @slug, @icon)
      `);

    return success(res, result.recordset[0], 'Category created', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, icon } = req.body;

  try {
    const slug = name ? slugify(name) : req.body.slug;
    await getPool().request()
      .input('id', id)
      .input('name', name || null)
      .input('slug', slug || null)
      .input('icon', icon || null)
      .query(`
        UPDATE Categories
        SET Name = COALESCE(@name, Name),
            Slug = COALESCE(@slug, Slug),
            Icon = COALESCE(@icon, Icon)
        WHERE CategoryID = @id
      `);

    return success(res, { categoryId: Number(id) }, 'Category updated');
  } catch (err) {
    return error(res, err.message);
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const products = await getPool().request()
      .input('id', id)
      .query('SELECT COUNT(*) AS total FROM Products WHERE CategoryID = @id AND IsDeleted = 0');

    if (products.recordset[0]?.total > 0) {
      return error(res, 'Cannot delete category that still has active products', 409);
    }

    await getPool().request()
      .input('id', id)
      .query('DELETE FROM Categories WHERE CategoryID = @id');

    return success(res, { categoryId: Number(id) }, 'Category deleted');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};

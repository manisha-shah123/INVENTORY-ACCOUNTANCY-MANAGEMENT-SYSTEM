import api from "./api";

const makeService = (resource) => ({
  fetchAll: async () => (await api.get(`/${resource}`)).data,
  create: async (name) => (await api.post(`/${resource}`, { name })).data,
  update: async (id, name) =>
    (await api.put(`/${resource}/${id}`, { name })).data,
  remove: async (id) => (await api.delete(`/${resource}/${id}`)).data,
});

export const brandService = makeService("brands");
export const categoryService = makeService("categories");
export const gradeService = makeService("grades");
export const sizeService = makeService("sizes");
export const hsCodeService = makeService("hscodes");
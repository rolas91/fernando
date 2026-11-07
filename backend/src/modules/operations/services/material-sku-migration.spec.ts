import { AddMaterialSku20261027001000 } from '../../../database/migrations/20261027001000-AddMaterialSku';

describe('material SKU migration', () => {
  it('only adds an empty independent SKU without rewriting IDs or existing data', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
    await new AddMaterialSku20261027001000().up(queryRunner as never);
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(`ALTER TABLE "materials" ADD COLUMN "sku" varchar(120) NOT NULL DEFAULT ''`);
  });
});

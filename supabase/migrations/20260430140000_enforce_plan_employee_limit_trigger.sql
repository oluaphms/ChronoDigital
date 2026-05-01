-- Travamento de licenças no banco: impede INSERT de colaborador ativo além do plano
-- (complementa validação em API / app). Limites alinhados a services/planLimitsCore.ts

CREATE OR REPLACE FUNCTION public.enforce_company_plan_employee_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_plan text;
  v_cnt int;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.role, '') <> 'employee' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL OR btrim(NEW.company_id::text) = '' THEN
    RETURN NEW;
  END IF;

  SELECT lower(btrim(COALESCE(c.plan, 'free'))) INTO v_plan
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_plan = 'enterprise' THEN
    RETURN NEW;
  END IF;
  IF v_plan = 'pro' THEN
    v_max := 50;
  ELSE
    v_max := 5;
  END IF;

  SELECT COUNT(*)::int INTO v_cnt
  FROM public.users u
  WHERE u.company_id = NEW.company_id
    AND u.role = 'employee'
    AND COALESCE(u.status, 'active') = 'active';

  IF v_cnt >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: Limite do plano atingido para colaboradores ativos'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_enforce_plan_employee_limit ON public.users;
CREATE TRIGGER trg_users_enforce_plan_employee_limit
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_company_plan_employee_limit();

COMMENT ON FUNCTION public.enforce_company_plan_employee_limit() IS
  'Bloqueia INSERT de employee ativo quando o tenant já atingiu o máximo do plano (free=5, pro=50, enterprise=ilimitado).';

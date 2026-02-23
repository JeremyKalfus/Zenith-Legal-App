alter type public.firm_status
  add value if not exists 'Authorized, will submit soon'
  after 'Waiting on your authorization to contact/submit';

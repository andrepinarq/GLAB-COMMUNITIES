-- As quatro comunidades publicadas em gavealab.com.br/communities e os dois selos iniciais.

INSERT INTO communities (slug, name, description, status, sort_order) VALUES
  ('lideres-da-estetica', 'Líderes da Estética',
   'Rede privada e curada para profissionais que lideram, inovam, empreendem, ensinam, pesquisam ou ajudam a transformar o mercado da estética.',
   'in_development', 1),
  ('lideres-da-arquitetura', 'Líderes da Arquitetura',
   'Rede para profissionais que lideram escritórios, projetos, negócios, pesquisa, ensino e inovação no campo da arquitetura.',
   'in_development', 2),
  ('lideres-do-mercado-imobiliario', 'Líderes do Mercado Imobiliário',
   'Comunidade para profissionais que lideram negócios, investimentos, incorporação, desenvolvimento, inteligência e transformação no mercado imobiliário.',
   'in_development', 3),
  ('lideres-em-ia', 'Líderes em IA',
   'Rede para profissionais que lideram aplicações, negócios, pesquisa, produtos, estratégia e transformação organizacional com inteligência artificial.',
   'in_development', 4);

INSERT INTO badges (slug, name, description) VALUES
  ('membro-fundador', 'Membro Fundador', 'Participou da formação da comunidade.'),
  ('conselho-curador', 'Conselho Curador', 'Integra o Conselho Curador da comunidade.');
